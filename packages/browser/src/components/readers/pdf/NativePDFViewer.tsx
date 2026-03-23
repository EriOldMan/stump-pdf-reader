import { useSDK } from '@stump/client'
import { useEffect, useState } from 'react'

import PDFReader from './PDFReader'

type Props = {
	/**
	 * The ID of the media
	 */
	id: string
}

export default function NativePDFViewer({ id }: Props) {
	const { sdk } = useSDK()
	const [pdfObjectUrl, setPdfObjectUrl] = useState<string>()

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
			<PDFReader id={id} src={pdfObjectUrl} />
		</div>
	)
}
