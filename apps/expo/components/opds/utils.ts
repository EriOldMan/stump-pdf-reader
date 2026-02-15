import { useSDK } from '@stump/client'
import { OPDSMetadata, OPDSPublication, resolveUrl } from '@stump/sdk'
import dayjs from 'dayjs'
import get from 'lodash/get'
import { useCallback } from 'react'
import { stringMd5 } from 'react-native-quick-md5'
import { match, P } from 'ts-pattern'
import { z } from 'zod'

const CANTOOK_PROGRESSION_REL = 'http://www.cantook.com/api/progression'
const READIUM_PROGRESSION_TYPE = 'application/vnd.readium.progression+json'

const flexibleStringValue = z.string()

const flexibleArrayValue = z.array(z.string())

const flexibleObjectArrayValue = z.array(
	z.object({
		name: z.string(), // We can't predict all the keys in the world but name feels pretty safe, Codex uses this format for credits
	}),
)

const flexibleMetadataValue = z.union([
	flexibleStringValue,
	flexibleArrayValue,
	flexibleObjectArrayValue,
])

type FlexibleMetadataValue = z.infer<typeof flexibleMetadataValue>

/**
 * Normalizes a flexible metadata value into an array of strings.
 * Handles comma-separated strings, string arrays, and object arrays with `name`.
 */
export const normalizeToStringArray = (value: unknown): string[] => {
	const parsed = flexibleMetadataValue.safeParse(value)
	if (!parsed.success) {
		return []
	}

	return match(parsed.data as FlexibleMetadataValue)
		.with(P.string, (str) =>
			str
				.split(/[,;]/)
				.map((s) => s.trim())
				.filter(Boolean),
		)
		.with(P.array(P.string), (arr) => arr)
		.with(P.array({ name: P.string }), (arr) => arr.map((obj) => obj.name))
		.exhaustive()
}

export const getFlexibleArrayField = (
	meta: OPDSMetadata | null | undefined,
	key: string,
): string[] => {
	if (!meta) return []
	const value = get(meta, key)
	return normalizeToStringArray(value)
}

type CreditFieldDefinition = {
	keys: string[]
	label: string
}

export const CREDIT_FIELD_DEFINITIONS: CreditFieldDefinition[] = [
	{ keys: ['author', 'authors'], label: 'Authors' },
	{ keys: ['writer', 'writers'], label: 'Writers' },
	{ keys: ['artist', 'artists'], label: 'Artists' },
	{ keys: ['penciler', 'pencilers'], label: 'Pencilers' },
	{ keys: ['inker', 'inkers'], label: 'Inkers' },
	{ keys: ['colorist', 'colorists'], label: 'Colorists' },
	{ keys: ['letterer', 'letterers'], label: 'Letterers' },
	{ keys: ['coverArtist', 'coverArtists'], label: 'Cover Artists' },
	{ keys: ['editor', 'editors'], label: 'Editors' },
	{ keys: ['translator', 'translators'], label: 'Translators' },
	{ keys: ['contributor', 'contributors'], label: 'Contributors' },
	{ keys: ['illustrator', 'illustrators'], label: 'Illustrators' },
	{ keys: ['narrator', 'narrators'], label: 'Narrators' },
]

export type ExtractedCredit = {
	label: string
	names: string[]
}

export const extractCredits = (meta: OPDSMetadata | null | undefined): ExtractedCredit[] => {
	if (!meta) return []

	const credits: ExtractedCredit[] = []

	for (const definition of CREDIT_FIELD_DEFINITIONS) {
		const allNames: string[] = []

		for (const key of definition.keys) {
			const names = getFlexibleArrayField(meta, key)
			allNames.push(...names)
		}

		const uniqueNames = [...new Set(allNames)] // dedup

		if (uniqueNames.length > 0) {
			credits.push({
				label: definition.label,
				names: uniqueNames,
			})
		}
	}

	return credits
}

export const getNumberField = (meta: OPDSMetadata, key: string) => {
	const value = get(meta, key)
	return typeof value === 'number' ? value : null
}

export const getStringField = (meta: OPDSMetadata, key: string) => {
	const value = get(meta, key)
	return typeof value === 'string' ? value : null
}

export const getDateField = (meta: OPDSMetadata, key: string) => {
	const value = get(meta, key)
	const _dayjs = dayjs(typeof value === 'string' ? value : null)
	return _dayjs.isValid() ? _dayjs : null
}

// An identifier that can be generated from a URL to uniquely identify a publication
// without dealing with common URL issues for file names
export const hashFromURL = (url: string) => stringMd5(url)

export const extensionFromMime = (mime: string | null | undefined): string | null => {
	if (!mime) return null
	switch (mime) {
		case 'application/epub+zip':
			return 'epub'
		case 'application/pdf':
			return 'pdf'
		case 'application/zip':
		case 'application/vnd.comicbook+zip':
		case 'application/x-cbz':
			return 'cbz'
		case 'application/x-cbr':
		case 'application/vnd.comicbook-rar':
			return 'cbr'
		case 'application/x-rar-compressed':
			return 'rar'
		default:
			return null
	}
}

export const getAcquisitionLink = (links: OPDSPublication['links']) => {
	return links?.find((link) => link.rel === 'http://opds-spec.org/acquisition')
}

export const getPublicationId = (
	url: string,
	metadata: OPDSMetadata | null | undefined,
): string => {
	const identifier = metadata?.identifier
	return identifier || hashFromURL(url)
}

export const getProgressionURL = (links: OPDSPublication['links'], baseUrl?: string) => {
	const progressionLink = links?.find(
		(link) => link.rel === CANTOOK_PROGRESSION_REL || link.type === READIUM_PROGRESSION_TYPE,
	)
	if (progressionLink?.href) {
		return resolveUrl(progressionLink.href, baseUrl)
	}
}

export const getPublicationThumbnailURL = (
	{
		images,
		resources,
		readingOrder,
	}: Pick<OPDSPublication, 'images' | 'resources' | 'readingOrder'>,
	baseUrl?: string,
) => {
	const imageURL = images?.at(0)?.href
	if (imageURL) {
		return resolveUrl(imageURL, baseUrl)
	}

	const resourceURL = resources?.find(({ type }) => type?.startsWith('image'))?.href
	if (resourceURL) {
		return resolveUrl(resourceURL, baseUrl)
	}

	const readingOrderURL = readingOrder?.find(({ type }) => type?.startsWith('image'))?.href
	if (readingOrderURL) {
		return resolveUrl(readingOrderURL, baseUrl)
	}
}

export function useResolveURL() {
	const { sdk } = useSDK()
	return useCallback((url: string) => resolveUrl(url, sdk.rootURL), [sdk.rootURL])
}
