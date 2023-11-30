import { Forma } from "forma-embedded-view-sdk/auto"
import { useCallback } from "preact/hooks"

export default function LeftSide() {
  const selectPolygon = useCallback(() => {
    Forma.designTool.getPolygon().then((polygon) => {
      const polygonQuery = JSON.stringify(polygon)
      const url = `https://trygve-aaberge-adsk.github.io/extendathon-terrain-editing/?polygon=${encodeURIComponent(
        polygonQuery,
      )}`
      Forma.openFloatingPanel({
        embeddedViewId: "floating-panel",
        url,
      })
    })
  }, [])

  return <weave-button onClick={selectPolygon}>test</weave-button>
}
