import { useSDK } from '@stump/client'
import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router'

import PDFReader from './PDFReader'

type Props = {
	/**
	 * The ID of the media
	 */
	id: string
}

export default function NativePDFViewer({ id }: Props) {
	const { sdk } = useSDK()
	const location = useLocation()
	const [pdfObjectUrl, setPdfObjectUrl] = useState<string>()

	const initialPage = useMemo(() => {
		const searchParams = new URLSearchParams(location.search)
		const page = searchParams.get('page')
		return page ? parseInt(page, 10) : 1
	}, [location.search])

	useEffect(() => {
		async function fetchPdf() {
			const response = await fetch(sdk.media.downloadURL(id), {
				credentials: 'include',
			})
			const blob = await response.blob()
			const arrayBuffer = await blob.arrayBuffer()
			setPdfObjectUrl(URL.createObjectURL(new Blob([arrayBuffer], { type: 'application/pdf' })))
		}
		if (!pdfObjectUrl) {
			fetchPdf()
		}
		return () => {
			if (pdfObjectUrl) {
				URL.revokeObjectURL(pdfObjectUrl)
			}
		}
	}, [sdk, id, pdfObjectUrl])

	if (!pdfObjectUrl) {
		return null
	}

	return (
		<div className="h-full w-full">
			<PDFReader id={id} src={pdfObjectUrl} initialPage={initialPage} />
		</div>
	)
}
