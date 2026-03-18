import { ref } from 'vue'
import type { VeoInlineAsset, VeoReferenceAsset } from '../api/veo'

export interface VeoFormAssetFields {
  image: VeoInlineAsset | null
  lastFrame: VeoInlineAsset | null
  referenceImages: VeoReferenceAsset[]
  video: VeoInlineAsset | null
  sourceVideoRef: { jobId: string; index: number } | null
}

export function useVeoAssetHandlers(form: VeoFormAssetFields, selectedSourceVideo: { value: string }) {
  const expandColor = ref('#000000')
  const expandingImage = ref<'start' | 'end' | null>(null)

  // ── File helpers ──
  async function fileToAsset(file: File): Promise<VeoInlineAsset> {
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    return {
      base64Data,
      mimeType: file.type || 'application/octet-stream',
      fileName: file.name,
      previewUrl: base64Data,
    }
  }

  async function urlToAsset(url: string, mime: string): Promise<VeoInlineAsset> {
    const resp = await fetch(url)
    const blob = await resp.blob()
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    return {
      base64Data,
      mimeType: mime || blob.type || 'image/png',
      fileName: url.split('/').pop() || 'dropped-image',
      previewUrl: base64Data,
    }
  }

  // ── Drag & Drop ──
  function getDroppedAssetData(e: DragEvent): { url: string; mime: string; type: string } | null {
    const dt = e.dataTransfer
    if (!dt) return null

    const raw = dt.getData('application/x-flowcraft-asset')
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { url?: string; mimeType?: string; type?: string }
        if (parsed.url) {
          return {
            url: parsed.url,
            mime: parsed.mimeType || 'image/jpeg',
            type: parsed.type || '',
          }
        }
      } catch {}
    }

    const url = dt.getData('application/x-asset-url') || dt.getData('text/uri-list') || dt.getData('text/plain')
    if (!url) return null

    return {
      url,
      mime: dt.getData('application/x-asset-mime') || 'image/jpeg',
      type: dt.getData('application/x-asset-type') || '',
    }
  }

  async function onStartImageDrop(e: DragEvent) {
    e.preventDefault()
    const dropped = getDroppedAssetData(e)
    if (!dropped?.url) return
    form.image = await urlToAsset(dropped.url, dropped.mime)
    form.sourceVideoRef = null
  }

  async function onEndImageDrop(e: DragEvent) {
    e.preventDefault()
    const dropped = getDroppedAssetData(e)
    if (!dropped?.url) return
    form.lastFrame = await urlToAsset(dropped.url, dropped.mime)
  }

  async function onVideoDrop(e: DragEvent) {
    e.preventDefault()
    const dropped = getDroppedAssetData(e)
    if (!dropped?.url || dropped.type !== 'video') return
    form.video = await urlToAsset(dropped.url, dropped.mime)
  }

  async function onRefSlotDrop(e: DragEvent, _slotIndex: number) {
    e.preventDefault()
    const dropped = getDroppedAssetData(e)
    if (!dropped?.url || form.referenceImages.length >= 4) return
    const asset = await urlToAsset(dropped.url, dropped.mime)
    form.referenceImages.push({
      ...asset,
      referenceType: 'STYLE',
      description: '',
    } as VeoReferenceAsset)
  }

  // ── File uploads ──
  async function onImageUpload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) return
    form.image = await fileToAsset(file)
    form.sourceVideoRef = null
  }

  async function onLastFrameUpload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) return
    form.lastFrame = await fileToAsset(file)
  }

  async function onVideoUpload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) return
    form.video = await fileToAsset(file)
    form.sourceVideoRef = null
    selectedSourceVideo.value = ''
  }

  // ── Expand Border ──
  function expandImageBorder(target: 'start' | 'end') {
    const asset = target === 'start' ? form.image : form.lastFrame
    if (!asset?.previewUrl) return

    expandingImage.value = target
    const img = new Image()
    img.onload = () => {
      const padding = 0.25
      const newW = Math.round(img.width * (1 + padding * 2))
      const newH = Math.round(img.height * (1 + padding * 2))
      const offsetX = Math.round(img.width * padding)
      const offsetY = Math.round(img.height * padding)

      const canvas = document.createElement('canvas')
      canvas.width = newW
      canvas.height = newH
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = expandColor.value
      ctx.fillRect(0, 0, newW, newH)
      ctx.drawImage(img, offsetX, offsetY, img.width, img.height)

      const dataUrl = canvas.toDataURL('image/png')

      const expanded = {
        ...asset,
        previewUrl: dataUrl,
        base64Data: dataUrl,
        mimeType: 'image/png',
        fileName: `expanded-${asset.fileName || 'image.png'}`,
      }

      if (target === 'start') {
        form.image = expanded
      } else {
        form.lastFrame = expanded
      }
      expandingImage.value = null
    }
    img.src = asset.previewUrl
  }

  function copyStartToEnd() {
    if (!form.image) return
    form.lastFrame = { ...form.image }
  }

  function resetMediaState() {
    form.image = null
    form.lastFrame = null
    form.referenceImages = []
    form.video = null
    form.sourceVideoRef = null
    selectedSourceVideo.value = ''
  }

  function normalizeAsset(asset?: VeoInlineAsset | null): VeoInlineAsset | null {
    if (!asset?.base64Data) return null
    return {
      ...asset,
      previewUrl: asset.previewUrl || asset.base64Data,
    }
  }

  return {
    expandColor,
    expandingImage,
    fileToAsset,
    urlToAsset,
    onStartImageDrop,
    onEndImageDrop,
    onVideoDrop,
    onRefSlotDrop,
    onImageUpload,
    onLastFrameUpload,
    onVideoUpload,
    expandImageBorder,
    copyStartToEnd,
    resetMediaState,
    normalizeAsset,
  }
}
