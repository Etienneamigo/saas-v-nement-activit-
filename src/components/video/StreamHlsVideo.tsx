"use client"

import { useEffect, useRef, forwardRef, useImperativeHandle } from "react"
import Hls from "hls.js"

interface StreamHlsVideoProps {
  src: string
  poster?: string
  autoPlay?: boolean
  muted?: boolean
  loop?: boolean
  playsInline?: boolean
  controls?: boolean
  className?: string
  preload?: string
  onLoadedMetadata?: () => void
  onError?: () => void
}

/**
 * HLS-compatible video player.
 * - Safari: uses native HLS support via <video src=...>
 * - Chrome/Firefox: uses hls.js to attach the HLS stream
 * - Fallback: for non-HLS URLs (.mp4), renders a plain <video> tag
 */
export const StreamHlsVideo = forwardRef<HTMLVideoElement, StreamHlsVideoProps>(
  function StreamHlsVideo(
    {
      src,
      poster,
      autoPlay = false,
      muted = false,
      loop = false,
      playsInline = false,
      controls = false,
      className,
      preload,
      onLoadedMetadata,
      onError,
    },
    ref
  ) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const hlsRef = useRef<Hls | null>(null)

    // Expose the video element via ref
    useImperativeHandle(ref, () => videoRef.current!, [])

    // React doesn't reliably update the `muted` DOM property via JSX attribute.
    // Synchronize imperatively whenever the prop changes.
    useEffect(() => {
      const video = videoRef.current
      if (video) {
        video.muted = muted
      }
    }, [muted])

    const isHls = src.includes(".m3u8") || src.includes("cloudflarestream.com")

    useEffect(() => {
      const video = videoRef.current
      if (!video || !isHls) return

      // Safari supports HLS natively
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src
        return
      }

      // For other browsers, use hls.js
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
        })
        hlsRef.current = hls

        hls.loadSource(src)
        hls.attachMedia(video)

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            console.error("HLS fatal error:", data.type, data.details)
            onError?.()
            // Try to recover
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              hls.startLoad()
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError()
            } else {
              hls.destroy()
            }
          }
        })

        return () => {
          hls.destroy()
          hlsRef.current = null
        }
      } else {
        // Fallback: try direct source (might work on some browsers)
        video.src = src
      }
    }, [src, isHls, onError])

    // For non-HLS sources, just use plain video
    if (!isHls) {
      return (
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          autoPlay={autoPlay}
          muted={muted}
          loop={loop}
          playsInline={playsInline}
          controls={controls}
          className={className}
          preload={preload}
          onLoadedMetadata={onLoadedMetadata}
        >
          Votre navigateur ne supporte pas la lecture de vidéos.
        </video>
      )
    }

    return (
      <video
        ref={videoRef}
        poster={poster}
        autoPlay={autoPlay}
        muted={muted}
        loop={loop}
        playsInline={playsInline}
        controls={controls}
        className={className}
        preload={preload}
        onLoadedMetadata={onLoadedMetadata}
      >
        Votre navigateur ne supporte pas la lecture de vidéos.
      </video>
    )
  }
)
