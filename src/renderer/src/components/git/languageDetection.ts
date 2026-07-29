export interface MonacoLanguageDescriptor {
  id: string
  extensions?: readonly string[]
  filenames?: readonly string[]
}

function getFilename(filePath: string): string {
  return filePath.replaceAll('\\', '/').split('/').pop()?.toLowerCase() ?? ''
}

export function detectMonacoLanguage(
  filePath: string,
  languages: readonly MonacoLanguageDescriptor[]
): string {
  const filename = getFilename(filePath)
  const filenameMatch = languages.find((language) =>
    language.filenames?.some((candidate) => candidate.toLowerCase() === filename)
  )

  if (filenameMatch) {
    return filenameMatch.id
  }

  const extensionMatch = languages
    .flatMap((language) =>
      (language.extensions ?? []).map((extension) => ({
        id: language.id,
        extension: extension.toLowerCase()
      }))
    )
    .sort((left, right) => right.extension.length - left.extension.length)
    .find(({ extension }) => filename.endsWith(extension))

  return extensionMatch?.id ?? 'plaintext'
}
