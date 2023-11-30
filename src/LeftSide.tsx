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

function openFloatingPanel(polygon: Vec3[] | undefined) {
  const url = getFloatingPanelUrl(polygon)
  void Forma.openFloatingPanel({
    embeddedViewId: "floating-panel",
    url,
    preferredSize: {
      width: 10000,
      height: 10000,
    },
  })
}

export default function LeftSide() {
  const polygonQuery = new URLSearchParams(window.location.search).get(
    "polygon",
  )

  if (polygonQuery != null) {
    openFloatingPanel(JSON.parse(polygonQuery) as Vec3[])
  }

  const selectPolygon = useCallback(() => {
    void Forma.designTool.getPolygon().then((polygon) => {
      console.log("polygon", JSON.stringify(polygon))
      console.log(
        "polygon encoded",
        encodeURIComponent(JSON.stringify(polygon)),
      )
      openFloatingPanel(polygon)
    })
  }, [])

  return (
    <>
      <div>
        <img width={"50%"} src={"/extendathon-terrain-editing/ragnhild.png"} />
      </div>
      <weave-button variant="solid" onClick={selectPolygon}>test</weave-button>
    </>
  )
}
