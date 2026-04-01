import { useSDK } from '@stump/client'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useParams } from 'react-router'

import NativePDFViewer from '@/components/readers/pdf/NativePDFViewer'

/**
 * A scene for reading PDFs using the native PDF viewer in the browser.
 */
export default function PDFReaderScene() {
	const { id } = useParams()
	const { sdk } = useSDK()
	const queryClient = useQueryClient()

	useEffect(() => {
		return () => {
			if (id) {
				queryClient.invalidateQueries({ queryKey: ['bookOverview', id] })
			}
			queryClient.invalidateQueries({ queryKey: ['inProgress'] })
		}
	}, [sdk.media, id, queryClient])

	if (!id) {
		throw new Error('Media ID is required')
	}

	return <NativePDFViewer id={id} />
}
