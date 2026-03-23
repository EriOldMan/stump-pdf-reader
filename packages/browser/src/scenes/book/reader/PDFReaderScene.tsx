import { invalidateQueries, useSDK } from '@stump/client'
import { useEffect } from 'react'
import { useParams } from 'react-router'

import NativePDFViewer from '@/components/readers/pdf/NativePDFViewer'

/**
 * A scene for reading PDFs using the native PDF viewer in the browser.
 */
export default function PDFReaderScene() {
	const { id } = useParams()
	const { sdk } = useSDK()

	useEffect(() => {
		return () => {
			invalidateQueries({ exact: false, keys: [sdk.media.keys.inProgress] })
			if (id) {
				invalidateQueries({ exact: false, keys: [sdk.media.keys.getByID, id] })
			}
		}
	}, [sdk.media, id])

	if (!id) {
		throw new Error('Media ID is required')
	}

	return <NativePDFViewer id={id} />
}
