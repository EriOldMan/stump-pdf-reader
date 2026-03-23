import { useUpdateMediaProgress } from '@stump/client'
import { ArrowLeft } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
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

export default function PDFReader({ id, src, initialPage = 1 }: Props) {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null)
	const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null)

	const [currentPage, setCurrentPage] = useState(initialPage)
	const [totalPages, setTotalPages] = useState(0)
	const [scale, setScale] = useState(1.5)
	const [isLoading, setIsLoading] = useState(true)

	const { updateReadProgressAsync } = useUpdateMediaProgress(id)
	const navigate = useNavigate()
	const [showNav, setShowNav] = useState(true)
	const navTimeoutRef = useRef<NodeJS.Timeout | null>(null)

	useEffect(() => {
		const resetTimeout = () => {
			setShowNav(true)
			if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current)
			navTimeoutRef.current = setTimeout(() => setShowNav(false), 3000)
		}

		resetTimeout()
		window.addEventListener('mousemove', resetTimeout)
		window.addEventListener('keydown', resetTimeout)

		return () => {
			window.removeEventListener('mousemove', resetTimeout)
			window.removeEventListener('keydown', resetTimeout)
			if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current)
		}
	}, [])

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

	// Render a page onto the canvas
	const renderPage = useCallback(
		async (pageNum: number) => {
			const pdf = pdfRef.current
			const canvas = canvasRef.current
			if (!pdf || !canvas) return

			// Cancel any in-progress render before starting a new one
			renderTaskRef.current?.cancel()

			const page = await pdf.getPage(pageNum)
			const viewport = page.getViewport({ scale })
			const ctx = canvas.getContext('2d')!

			// High-DPI display support
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

			try {
				await task.promise
				// Save progress to Stump after each successful page render
				await updateReadProgressAsync({ page: pageNum })
			} catch (e: unknown) {
				if (e instanceof Error && e.name !== 'RenderingCancelledException') {
					console.error(e)
				}
			}
		},
		[scale, updateReadProgressAsync],
	)

	// Re-render when page or scale changes
	useEffect(() => {
		if (totalPages > 0) renderPage(currentPage)
	}, [currentPage, totalPages, renderPage])

	// Keyboard navigation
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '')) return

			if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
				setCurrentPage((p) => Math.min(p + 1, totalPages))
			}
			if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
				setCurrentPage((p) => Math.max(p - 1, 1))
			}
		}
		window.addEventListener('keydown', handler)
		return () => window.removeEventListener('keydown', handler)
	}, [totalPages])

	const goTo = (page: number) => {
		setCurrentPage(Math.max(1, Math.min(page, totalPages)))
	}

	if (isLoading) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<span className="text-sm text-gray-400">Loading PDF...</span>
			</div>
		)
	}

	return (
		<div
			className="relative flex h-full w-full flex-col items-center overflow-auto"
			onClick={() => setShowNav((prev) => !prev)}
		>
			<canvas ref={canvasRef} className="my-8 max-w-full shadow-lg" />

			{/* Top Navigation Bar */}
			<div
				className={`fixed left-0 top-0 z-50 flex w-full items-center justify-between bg-black/80 px-4 py-3 text-white transition-transform duration-300 ${
					showNav ? 'translate-y-0' : '-translate-y-full'
				}`}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Back button */}
				<button
					onClick={() => navigate(-1)}
					className="flex items-center gap-2 rounded-md px-3 py-1.5 hover:bg-white/10"
				>
					<ArrowLeft className="h-5 w-5" />
					<span className="hidden sm:inline">Back</span>
				</button>

				{/* Page controls */}
				<div className="flex items-center gap-4">
					<button
						onClick={() => goTo(currentPage - 1)}
						disabled={currentPage <= 1}
						className="rounded px-2 py-1 hover:bg-white/10 disabled:opacity-40"
					>
						←
					</button>
					<span className="text-sm font-medium">
						{currentPage} / {totalPages}
					</span>
					<button
						onClick={() => goTo(currentPage + 1)}
						disabled={currentPage >= totalPages}
						className="rounded px-2 py-1 hover:bg-white/10 disabled:opacity-40"
					>
						→
					</button>
				</div>

				{/* Zoom controls */}
				<div className="flex items-center gap-2">
					<button
						onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
						className="rounded px-2 py-1 hover:bg-white/10 disabled:opacity-40"
					>
						−
					</button>
					<span className="w-12 text-center text-sm font-medium">{Math.round(scale * 100)}%</span>
					<button
						onClick={() => setScale((s) => Math.min(3, s + 0.25))}
						className="rounded px-2 py-1 hover:bg-white/10 disabled:opacity-40"
					>
						+
					</button>
				</div>
			</div>
		</div>
	)
}
