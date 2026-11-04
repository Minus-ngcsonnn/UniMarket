import { useEffect, useId, useRef, useState } from 'react'
import { LISTING_LIMITS } from '../../constants/product'
import { checkPhotoFiles } from '../../utils/listingValidation'
import { TrashIcon, UploadCloudIcon } from '../icons'
import FieldError from '../ui/FieldError'
import ImageSlot from '../ui/ImageSlot'
import useTranslation from '../../i18n/useTranslation'

let localPhotoCounter = 0

/**
 * Photo picker for listings, styled like the Figma upload area (Student ID verification modal):
 * dashed drop zone, "Click to upload or drag and drop", limits, then thumbnails.
 *
 * Photos stay in the browser (object URLs) for preview. Uploading them to the server is a backend
 * task (Q2: stored on the server disk) and is not part of this component.
 *
 * @param {{ id: string, url: string, name: string, file?: File, isLocal?: boolean }[]} photos
 *   first photo = cover. Existing photos (edit) have isLocal=false.
 * @param {(photos) => void} onChange
 */
export default function ImageUploader({ photos, onChange, error, name = 'photos', label = 'Photos' }) {
  const { t } = useTranslation()
  const inputId = useId()
  const errorId = error ? `${inputId}-error` : undefined
  const [rejections, setRejections] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const latestPhotos = useRef(photos)

  // Keep the latest list for the unmount cleanup below.
  useEffect(() => {
    latestPhotos.current = photos
  }, [photos])

  // Free browser memory used by local previews when the form is closed.
  useEffect(
    () => () => latestPhotos.current.forEach((photo) => photo.isLocal && URL.revokeObjectURL(photo.url)),
    [],
  )

  function addFiles(fileList) {
    const { accepted, rejected } = checkPhotoFiles([...fileList], photos.length)
    setRejections(rejected)
    if (accepted.length === 0) return
    const added = accepted.map((file) => ({
      id: `local-${++localPhotoCounter}`,
      url: URL.createObjectURL(file),
      name: file.name,
      file,
      isLocal: true,
    }))
    onChange([...photos, ...added])
  }

  function remove(photo) {
    if (photo.isLocal) URL.revokeObjectURL(photo.url)
    setRejections([])
    onChange(photos.filter((p) => p.id !== photo.id))
  }

  function makeCover(photo) {
    onChange([photo, ...photos.filter((p) => p.id !== photo.id)])
  }

  const remaining = LISTING_LIMITS.photosMax - photos.length

  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-medium text-ink">{t(label)}</span>

      {remaining > 0 && (
        <label
          htmlFor={inputId}
          onDragOver={(event) => {
            event.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setIsDragging(false)
            addFiles(event.dataTransfer.files)
          }}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-card border border-dashed px-6 py-8 text-center transition-colors focus-within:ring-2 focus-within:ring-primary/30 ${
            isDragging ? 'border-primary bg-primary-soft' : error ? 'border-danger bg-danger-soft/40' : 'border-primary/40 bg-primary-soft/50 hover:bg-primary-soft'
          }`}
        >
          <UploadCloudIcon className="size-7 text-primary" />
          <span className="text-sm font-semibold text-primary">{t("Click to upload or drag and drop")}</span>
          <span className="text-xs text-ink-muted">
            {t('JPG, PNG or WebP · Maximum 5 MB each · {remaining} of {max} photos left', { remaining, max: LISTING_LIMITS.photosMax })}
          </span>
          <input
            id={inputId}
            name={name}
            type="file"
            multiple
            accept={LISTING_LIMITS.photoTypes.join(',')}
            aria-invalid={error ? true : undefined}
            aria-describedby={errorId}
            onChange={(event) => {
              addFiles(event.target.files)
              event.target.value = '' // allow choosing the same file again after removing it
            }}
            className="sr-only"
          />
        </label>
      )}

      {rejections.length > 0 && (
        <ul role="alert" className="flex flex-col gap-1 rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
          {rejections.map((message) => (
            <li key={message}>{t(message)}</li>
          ))}
        </ul>
      )}

      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4" aria-label={t("Selected photos")}>
          {photos.map((photo, index) => (
            <li key={photo.id} className="group relative aspect-square overflow-hidden rounded-control border border-line bg-subtle">
              {/* ImageSlot: an existing photo whose file is missing shows a placeholder instead of a broken image. */}
              <ImageSlot src={photo.url} alt={t('Photo {number}: {name}', { number: index + 1, name: photo.name })} />
              {index === 0 ? (
                <span className="absolute bottom-1.5 left-1.5 rounded bg-primary px-1.5 py-0.5 text-[11px] font-medium text-white">{t("Cover")}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => makeCover(photo)}
                  className="absolute bottom-1.5 left-1.5 rounded bg-surface/90 px-1.5 py-0.5 text-[11px] font-medium text-ink shadow-sm hover:text-primary"
                >
                  {t("Make cover")}
                </button>
              )}
              <button
                type="button"
                onClick={() => remove(photo)}
                aria-label={t('Remove photo {number} ({name})', { number: index + 1, name: photo.name })}
                className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-full bg-surface/90 text-ink shadow-sm hover:text-danger"
              >
                <TrashIcon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <FieldError id={errorId}>{error}</FieldError>
    </div>
  )
}
