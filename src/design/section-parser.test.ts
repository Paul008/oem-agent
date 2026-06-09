import { describe, expect, it } from 'vitest'
import { parseSection } from './section-parser'

describe('section-parser video detection', () => {
  it('detects inline video tags with data-src attributes', () => {
    const result = parseSection('<section><video data-src="/media/hero-loop.mp4" data-poster="/media/hero-poster.jpg" controls></video><p>overview</p></section>')

    expect(result.type).toBe('video')
    expect(result.data.video_url).toBe('/media/hero-loop.mp4')
    expect(result.data.poster_url).toBe('/media/hero-poster.jpg')
  })

  it('detects source elements with lazy video attributes', () => {
    const result = parseSection('<section><video><source data-srcset="/media/alt.webm 1x, /media/alt-hires.webm 2x" type="video/webm"></video><div>tech</div></section>')

    expect(result.type).toBe('video')
    expect(result.data.video_url).toBe('/media/alt.webm')
  })

  it('detects iframe-based video embeds', () => {
    const result = parseSection('<section><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="video"></iframe><p>preview</p></section>')

    expect(result.type).toBe('video')
    expect(result.data.video_url).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
  })

  it('detects lightbox-style anchor data-video urls', () => {
    const result = parseSection('<section><a data-video-url="/assets/car-loop.mp4" data-lightbox="gallery" href="/gallery">Watch</a><p>intro</p></section>')

    expect(result.type).toBe('video')
    expect(result.data.video_url).toBe('/assets/car-loop.mp4')
  })

  it('detects Mitsubishi online-media provider blocks', () => {
    const result = parseSection('<section><div class="onlinemedia" data-source-id="yQ_qNCe98OI" data-media="youtube"><picture><source srcset="/content/dam/mmal/discovery-mitsubishi/45-year-anniversary/Luke%20McGregor%20PLAY.jpg"><img class="lazyload" data-src="/content/dam/mmal/discovery-mitsubishi/45-year-anniversary/Luke%20McGregor%20PLAY.jpg"></picture><a href="#" class="play-video disabled"></a></div><p>Along for the Ride</p></section>')

    expect(result.type).toBe('video')
    expect(result.data.video_url).toBe('https://www.youtube.com/watch?v=yQ_qNCe98OI')
    expect(result.data.poster_url).toBe('/content/dam/mmal/discovery-mitsubishi/45-year-anniversary/Luke%20McGregor%20PLAY.jpg')
  })
})
