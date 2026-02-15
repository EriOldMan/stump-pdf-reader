import { OPDSMetadata } from '@stump/sdk'
import { useMemo } from 'react'
import { View } from 'react-native'

import MetadataBadgeSection from '~/components/overview/MetadataBadgeSection'

import { extractCredits } from './utils'

type Props = {
	metadata: OPDSMetadata | null | undefined
}

export default function CreditsSection({ metadata }: Props) {
	const credits = useMemo(() => extractCredits(metadata), [metadata])

	if (credits.length === 0) {
		return null
	}

	return (
		<View className="gap-6">
			{credits.map((credit) => (
				<MetadataBadgeSection key={credit.label} label={credit.label} items={credit.names} />
			))}
		</View>
	)
}
