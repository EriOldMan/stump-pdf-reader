import { useUpdateMediaProgress } from '@stump/client'
import {
	ArrowLeft,
	Maximize2,
	Scroll,
	Files,
	ArrowUpDown,
	ArrowLeftRight,
	Minus,
	Plus,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useSwipeable } from 'react-swipeable'
import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
	'pdfjs-dist/build/pdf.worker.min.mjs',
	import.meta.url,
).toString()

type Props = {
	id: string
	src: string
	initialPage?: number
}

type PageProps = {
	pdf: pdfjsLib.PDFDocumentProxy
	pageNum: number
	scale: number
	/** Called once after the canvas finishes painting */
	onRendered?: (pageNum: number) => void
	isSeamless?: boolean
	scrollRoot?: HTMLElement | null
	/** Skip lazy-load: render immediately without waiting for intersection */
	eagerRender?: boolean
}

function PDFPage({
	pdf,
	pageNum,
	scale,
	onRendered,
	isSeamless,
	scrollRoot,
	eagerRender,
}: PageProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const containerRef = useRef<HTMLDivElement>(null)
	const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null)
	// Stable ref so the render effect never re-runs just because the callback identity changed
	const onRenderedRef = useRef(onRendered)
	useEffect(() => {
		onRenderedRef.current = onRendered
	}, [onRendered])

	const [isVisible, setIsVisible] = useState(!isSeamless || !!eagerRender)

	// Lazy-load observer — only used in seamless mode
	useEffect(() => {
		if (!isSeamless || eagerRender) return
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry?.isIntersecting) setIsVisible(true)
			},
			{
				root: scrollRoot,
				rootMargin: '1000px',
			},
		)
		if (containerRef.current) observer.observe(containerRef.current)
		return () => observer.disconnect()
	}, [isSeamless, eagerRender, scrollRoot])

	// Render the page onto the canvas whenever visibility, pdf, pageNum or scale change.
	// onRendered is accessed through a ref so it is NOT a dependency — changing the
	// callback identity will never cancel an in-progress render.
	useEffect(() => {
		if (!isVisible) return
		let mounted = true

		const render = async () => {
			const canvas = canvasRef.current
			if (!canvas || !pdf) return

			renderTaskRef.current?.cancel()

			try {
				const page = await pdf.getPage(pageNum)
				const viewport = page.getViewport({ scale })
				const ctx = canvas.getContext('2d')!

				const outputScale = window.devicePixelRatio || 1
				canvas.width = Math.floor(viewport.width * outputScale)
				canvas.height = Math.floor(viewport.height * outputScale)
				canvas.style.width = Math.floor(viewport.width) + 'px'
				canvas.style.height = Math.floor(viewport.height) + 'px'

				const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined

				const task = page.render({
					canvasContext: ctx,
					canvas: canvasRef.current!,
					viewport,
					transform,
				})
				renderTaskRef.current = task

				await task.promise
				if (mounted) onRenderedRef.current?.(pageNum)
			} catch (e: unknown) {
				if (mounted && e instanceof Error && e.name !== 'RenderingCancelledException') {
					console.error(`[PDFPage] Render error for page ${pageNum}:`, e)
				}
			}
		}

		render()

		return () => {
			mounted = false
			renderTaskRef.current?.cancel()
		}
	}, [isVisible, pdf, pageNum, scale]) // ← onRendered intentionally omitted; accessed via ref

	return (
		<div
			ref={containerRef}
			data-page={pageNum}
			className="flex flex-col items-center"
			style={{ minHeight: isSeamless ? '200px' : undefined }}
		>
			<canvas ref={canvasRef} className="shadow-md" />
		</div>
	)
}

export default function PDFReader({ id, src, initialPage = 1 }: Props) {
	const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null)

	const [currentPage, setCurrentPage] = useState(initialPage)
	const [totalPages, setTotalPages] = useState(0)
	const [scale, setScale] = useState(1.5)
	const [isLoading, setIsLoading] = useState(true)

	const { updateReadProgressAsync } = useUpdateMediaProgress(id)
	const navigate = useNavigate()
	const location = useLocation()

	const containerRef = useRef<HTMLDivElement>(null)
	const [showNav, setShowNav] = useState(true)
	const [isSeamless, setIsSeamless] = useState(false)
	const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('vertical')

	// Auto-hide nav after 3s on mount
	useEffect(() => {
		const timer = setTimeout(() => setShowNav(false), 3000)
		return () => clearTimeout(timer)
	}, [])

	// --- Page tracking in seamless mode via scroll ---
	// Calculate visible intersection area of each page against the screen viewport.
	// Using a window capturing scroll listener ensures we catch scrolls from ANY container.
	const handleScroll = useCallback(() => {
		if (!isSeamless || !containerRef.current) return
		const el = containerRef.current
		const containerRect = el.getBoundingClientRect()
		const pages = el.querySelectorAll<HTMLElement>('[data-page]')

		// Find the visible area of the container strictly within the window viewport
		const viewTop = Math.max(0, containerRect.top)
		const viewBottom = Math.min(window.innerHeight, containerRect.bottom)
		const viewLeft = Math.max(0, containerRect.left)
		const viewRight = Math.min(window.innerWidth, containerRect.right)

		let bestPage = currentPage
		let maxArea = 0

		pages.forEach((page) => {
			const rect = page.getBoundingClientRect()
			const intersectX = Math.max(
				0,
				Math.min(rect.right, viewRight) - Math.max(rect.left, viewLeft),
			)
			const intersectY = Math.max(
				0,
				Math.min(rect.bottom, viewBottom) - Math.max(rect.top, viewTop),
			)
			const area = intersectX > 0 && intersectY > 0 ? intersectX * intersectY : 0

			if (area > maxArea) {
				maxArea = area
				bestPage = parseInt(page.getAttribute('data-page') || '1', 10)
			}
		})

		if (maxArea > 0) {
			setCurrentPage((prevPage) => (prevPage !== bestPage ? bestPage : prevPage))
		}
	}, [isSeamless])

	// Attach a global scroll capturing listener to update current page.
	// This works even if the parent structure (e.g. body or main) is what actually scrolls.
	useEffect(() => {
		if (!isSeamless || totalPages === 0) return

		window.addEventListener('scroll', handleScroll, { passive: true, capture: true })
		// Also invoke immediately to set initial page
		handleScroll()

		return () => {
			window.removeEventListener('scroll', handleScroll, { capture: true })
		}
	}, [isSeamless, totalPages, handleScroll])

	// Load the PDF document
	useEffect(() => {
		let mounted = true
		const loadingTask = pdfjsLib.getDocument({ url: src, withCredentials: true })

		loadingTask.promise
			.then((pdf) => {
				if (!mounted) {
					pdf.destroy()
					return
				}
				pdfRef.current = pdf
				setTotalPages(pdf.numPages)
				setIsLoading(false)
			})
			.catch((e: unknown) => {
				if (mounted && e instanceof Error && e.name !== 'RenderingCancelledException') {
					console.error(e)
				}
			})

		return () => {
			mounted = false
			loadingTask.destroy()
		}
	}, [src])

	const handleFitToWidth = useCallback(async () => {
		if (!pdfRef.current || !containerRef.current) return
		try {
			const page = await pdfRef.current.getPage(1)
			const viewport = page.getViewport({ scale: 1 })
			const containerWidth = containerRef.current.clientWidth - 40
			setScale(containerWidth / viewport.width)
		} catch (e) {
			console.error('[PDFReader] Failed to calculate fit-to-width:', e)
		}
	}, [])

	// Stable ref for updateReadProgressAsync so it doesn't invalidate callbacks
	const updateProgressRef = useRef(updateReadProgressAsync)
	useEffect(() => {
		updateProgressRef.current = updateReadProgressAsync
	}, [updateReadProgressAsync])

	const onPageRenderSuccess = useCallback((pageNum: number) => {
		updateProgressRef.current({ page: pageNum })
	}, []) // truly stable — no deps

	// Sync current page to URL
	useEffect(() => {
		const searchParams = new URLSearchParams(location.search)
		if (searchParams.get('page') !== currentPage.toString()) {
			searchParams.set('page', currentPage.toString())
			navigate(`?${searchParams.toString()}`, { replace: true })
		}
	}, [currentPage, navigate, location.search])

	// Keyboard navigation
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '')) return
			if (e.key === 'ArrowRight' || e.key === 'ArrowDown')
				setCurrentPage((p) => Math.min(p + 1, totalPages))
			if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setCurrentPage((p) => Math.max(p - 1, 1))
		}
		window.addEventListener('keydown', handler)
		return () => window.removeEventListener('keydown', handler)
	}, [totalPages])

	const goTo = (page: number) => {
		const target = Math.max(1, Math.min(page, totalPages))
		setCurrentPage(target)
		if (isSeamless && containerRef.current) {
			const element = containerRef.current.querySelector(`[data-page="${target}"]`)
			if (element) {
				element.scrollIntoView({ behavior: 'smooth', block: 'start' })
			}
		}
	}

	// Snapshot the page we're on when seamless mode is enabled (before re-render)
	const seamlessTargetPage = useRef<number | null>(null)
	const prevIsSeamless = useRef(isSeamless)
	if (prevIsSeamless.current !== isSeamless) {
		prevIsSeamless.current = isSeamless
		if (isSeamless) {
			seamlessTargetPage.current = currentPage
		}
	}

	// After the target page is painted, scroll to it.
	const onSeamlessTargetRendered = useCallback(
		(pageNum: number) => {
			if (seamlessTargetPage.current === pageNum) {
				seamlessTargetPage.current = null
				const element = containerRef.current?.querySelector(`[data-page="${pageNum}"]`)
				if (element) {
					element.scrollIntoView({ block: 'start' })
				}
			}
			onPageRenderSuccess(pageNum)
		},
		[onPageRenderSuccess],
	)

	// No fallback timer needed — scroll tracking is event-driven.

	const swipeHandlers = useSwipeable({
		onSwipedLeft: () => {
			if (isSeamless && orientation === 'horizontal') return
			goTo(currentPage + 1)
		},
		onSwipedRight: () => {
			if (isSeamless && orientation === 'horizontal') return
			goTo(currentPage - 1)
		},
		onSwipedUp: () => {
			if (isSeamless && orientation === 'vertical') return
			goTo(currentPage + 1)
		},
		onSwipedDown: () => {
			if (isSeamless && orientation === 'vertical') return
			goTo(currentPage - 1)
		},
		preventScrollOnSwipe: false,
	})

	if (isLoading) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<span className="text-sm text-gray-400">Loading PDF...</span>
			</div>
		)
	}

	return (
		<div
			{...swipeHandlers}
			className="relative h-full w-full overflow-hidden bg-zinc-900 text-white"
			onClick={(e) => {
				// Prevent swipe events from triggering click
				if ((e.target as HTMLElement).closest('button')) return
				setShowNav((prev) => !prev)
			}}
		>
			<div
				ref={containerRef}
				className={`flex h-full w-full overflow-auto ${
					orientation === 'vertical'
						? 'flex-col items-center gap-4 py-4'
						: 'flex-row items-start gap-4 p-4'
				}`}
			>
				{pdfRef.current && (
					<>
						{!isSeamless ? (
							<PDFPage
								pdf={pdfRef.current}
								pageNum={currentPage}
								scale={scale}
								onRendered={onPageRenderSuccess}
							/>
						) : (
							Array.from({ length: totalPages }, (_, i) => {
								const pageNum = i + 1
								const isTarget =
									pageNum === (seamlessTargetPage.current ?? -1) ||
									(seamlessTargetPage.current === null && pageNum === currentPage)
								return (
									<PDFPage
										key={pageNum}
										pdf={pdfRef.current!}
										pageNum={pageNum}
										scale={scale}
										onRendered={onSeamlessTargetRendered}
										isSeamless={true}
										eagerRender={pageNum === currentPage}
									/>
								)
							})
						)}
					</>
				)}
			</div>

			{/* Top Navigation Bar */}
			<div
				className={`fixed left-0 top-0 z-50 flex w-full items-center justify-between bg-black/90 px-4 py-3 shadow-xl transition-transform duration-300 ${
					showNav ? 'translate-y-0' : '-translate-y-full'
				}`}
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center gap-2">
					<button
						onClick={() => navigate(-1)}
						className="flex items-center gap-2 rounded-md p-2 hover:bg-white/10"
						title="Go back"
					>
						<ArrowLeft className="h-5 w-5" />
					</button>

					<div className="mx-2 hidden h-6 w-px bg-white/20 sm:block" />

					<button
						onClick={handleFitToWidth}
						className="rounded-md p-2 hover:bg-white/10"
						title="Fit to width"
					>
						<Maximize2 className="h-5 w-5" />
					</button>

					<button
						onClick={() => setIsSeamless((prev) => !prev)}
						className="rounded-md p-2 hover:bg-white/10"
						title={isSeamless ? 'Switch to single page' : 'Switch to seamless scroll'}
					>
						{isSeamless ? <Files className="h-5 w-5" /> : <Scroll className="h-5 w-5" />}
					</button>

					<button
						onClick={() =>
							setOrientation((prev) => (prev === 'vertical' ? 'horizontal' : 'vertical'))
						}
						className="rounded-md p-2 hover:bg-white/10"
						title={`Switch to ${orientation === 'vertical' ? 'horizontal' : 'vertical'} scroll`}
					>
						{orientation === 'vertical' ? (
							<ArrowLeftRight className="h-5 w-5" />
						) : (
							<ArrowUpDown className="h-5 w-5" />
						)}
					</button>
				</div>

				{/* Page controls */}
				<div className="flex items-center gap-4 rounded-lg bg-white/10 px-3 py-1.5">
					<button
						onClick={() => goTo(currentPage - 1)}
						disabled={currentPage <= 1}
						className="rounded hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
					>
						←
					</button>
					<span className="min-w-[60px] text-center text-sm font-bold">
						{currentPage} / {totalPages}
					</span>
					<button
						onClick={() => goTo(currentPage + 1)}
						disabled={currentPage >= totalPages}
						className="rounded hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
					>
						→
					</button>
				</div>

				{/* Zoom controls */}
				<div className="flex items-center gap-2">
					<button
						onClick={() => setScale((s) => Math.max(0.25, s - 0.25))}
						className="rounded-md p-2 hover:bg-white/10"
						title="Zoom out"
					>
						<Minus className="h-4 w-4" />
					</button>
					<span className="w-12 text-center text-xs font-bold">{Math.round(scale * 100)}%</span>
					<button
						onClick={() => setScale((s) => Math.min(5, s + 0.25))}
						className="rounded-md p-2 hover:bg-white/10"
						title="Zoom in"
					>
						<Plus className="h-4 w-4" />
					</button>
				</div>
			</div>
		</div>
	)
}
