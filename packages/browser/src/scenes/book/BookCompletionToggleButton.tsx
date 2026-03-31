import { invalidateQueries, useMutation, useSDK } from '@stump/client'
import { Button } from '@stump/components'
import { Media, PutMediaCompletionStatus } from '@stump/sdk'
import { useCallback, useMemo } from 'react'
import toast from 'react-hot-toast'

import { EBOOK_EXTENSION } from '@/utils/patterns'

type Props = {
	book: Media
}

export default function BookCompletionToggleButton({ book }: Props) {
	const { sdk } = useSDK()

	const { mutateAsync: completeBook } = useMutation(
		[sdk.media.keys.complete, book.id],
		(payload: PutMediaCompletionStatus) => sdk.media.complete(book.id, payload),
	)

	const { mutateAsync: deleteCurrentSession } = useMutation(
		[sdk.media.keys.deleteActiveReadingSession, book.id],
		() => sdk.media.deleteActiveReadingSession(book.id),
	)

	const isCompleted = useMemo(() => !!book.is_completed, [book])
	const hasProgress = useMemo(() => !!book.active_reading_session, [book])
	const isEpub = useMemo(() => book.extension.match(EBOOK_EXTENSION), [book])

	const handleMarkRead = useCallback(async () => {
		const page = isEpub ? undefined : book.pages
		try {
			await completeBook({
				is_complete: true,
				page,
			})
			invalidateQueries({
				keys: [sdk.media.keys.getByID, sdk.media.keys.get],
			})
		} catch (error) {
			console.error(error)
			toast.error('Failed to update book completion status')
		}
	}, [book, completeBook, isEpub, sdk.media])

	const handleMarkUnread = useCallback(async () => {
		try {
			await deleteCurrentSession()
			invalidateQueries({
				keys: [sdk.media.keys.getByID, sdk.media.keys.get],
			})
		} catch (error) {
			console.error(error)
			toast.error('Failed to clear progress')
		}
	}, [book, deleteCurrentSession, sdk.media])

	const renderButtons = () => {
		// Case 1: Completed. We show 'Mark as unread' to allow clearing the records.
		if (isCompleted) {
			return (
				<Button variant="secondary" className="w-full md:w-auto" onClick={handleMarkUnread}>
					Mark as unread
				</Button>
			)
		}

		// Case 2: In progress but not completed. We show BOTH 'Mark as read' and 'Mark as unread'.
		if (hasProgress) {
			return (
				<>
					<Button variant="secondary" className="w-full md:w-auto" onClick={handleMarkRead}>
						Mark as read
					</Button>
					<Button variant="secondary" className="w-full md:w-auto" onClick={handleMarkUnread}>
						Mark as unread
					</Button>
				</>
			)
		}

		// Case 3: Not started. Only 'Mark as read'.
		return (
			<Button variant="secondary" className="w-full md:w-auto" onClick={handleMarkRead}>
				Mark as read
			</Button>
		)
	}

	return (
		<div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
			{renderButtons()}
		</div>
	)
}
