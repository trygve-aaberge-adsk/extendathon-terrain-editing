import { Forma } from "forma-embedded-view-sdk/auto"
import { Vec3 } from "forma-embedded-view-sdk/dist/internal/scene/design-tool"
import { useCallback } from "preact/hooks"

function getFloatingPanelUrl(polygon: Vec3[] | undefined) {
  const overriddenUrl = new URLSearchParams(window.location.search).get(
    "floating-panel-url",
  )
  const url = new URL(
    overriddenUrl ??
      "https://trygve-aaberge-adsk.github.io/extendathon-terrain-editing/",
  )

  if (polygon != null) {
    const query = new URLSearchParams(url.search)
    query.set("polygon", JSON.stringify(polygon))
    url.search = query.toString()
  }

  return url.toString()
}

export default function LeftSide() {
  const selectPolygon = useCallback(() => {
    Forma.designTool.getPolygon().then((polygon) => {
      const url = getFloatingPanelUrl(polygon)
      Forma.openFloatingPanel({
        embeddedViewId: "floating-panel",
        url,
        preferredSize: {
          width: 10000,
          height: 10000,
        },
      })
    })
  }, [])

  return <weave-button onClick={selectPolygon}>test</weave-button>
}
