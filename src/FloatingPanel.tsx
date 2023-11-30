import { Forma } from "forma-embedded-view-sdk/auto"
import { useEffect, useMemo, useState } from "preact/hooks"
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Camera,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  Vector2,
  WebGLRenderer,
} from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter"
import { repair } from "./terrainRepair"

let renderIteration = 0

function isInside(point: [number, number], vs: [number, number][]) {
  // ray-casting algorithm based on
  // https://wrf.ecse.rpi.edu/Research/Short_Notes/pnpoly.html

  const x = point[0],
    y = point[1]

  let inside = false
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0],
      yi = vs[i][1]
    const xj = vs[j][0],
      yj = vs[j][1]

    const intersect =
      yi > y != yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }

  return inside
}

function getNewTerrainVertices(
  terrain: BufferGeometry,
  polygon: [number, number][],
  height: number,
  normal: [number, number, number],
) {
  const newTerrain = terrain.clone()
  const posarray = newTerrain.toNonIndexed().getAttribute("position")
    .array as Float32Array
  for (let i = 0; i < posarray.length / 3; i++) {
    const x = posarray[i * 3]
    const y = posarray[i * 3 + 1]
    if (isInside([x, y], polygon)) {
      posarray[i * 3 + 2] = height - (x * normal[0] + y * normal[1])
    }
  }
  return posarray
}

function loadImageData(url: string) {
  return new Promise<Uint8ClampedArray>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "Anonymous"
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = 500
      canvas.height = 500
      const ctx = canvas.getContext("2d")!
      ctx.drawImage(img, 0, 0, 500, 500)
      const imageData = ctx.getImageData(0, 0, img.width, img.height)
      resolve(imageData.data)
    }
    img.width = 500
    img.height = 500
    img.onerror = reject
    img.src = url
  })
}

function FloatingPanel() {
  const [scene] = useState(new Scene())
  const [camera, setCamera] = useState<Camera>()
  const [renderer, setRenderer] = useState<WebGLRenderer>()

  const [originalTerrainGeometry, setOriginalTerrainGeometry] =
    useState<BufferGeometry>()
  const [terrainMesh, setTerrainMesh] = useState<Mesh>()
  const [height, setHeight] = useState(0)
  const [normal, setNormal] = useState<[number, number, number]>([0, 0, 1])
  const [funMode, setFunMode] = useState(false)
  const drawnPolygon = JSON.parse(
    new URLSearchParams(window.location.search).get("polygon")!,
  ) as { x: number; y: number; z: number }[]

  const polygon = drawnPolygon.map(
    (coord) => [coord.x, coord.y] as [number, number],
  )
  const polyMesh = useMemo(() => {
    const polyShape = new Shape(
      polygon.map((coord) => new Vector2(coord[0], coord[1])),
    )
    const polyGeometry = new ShapeGeometry(polyShape)
    polyGeometry.setAttribute(
      "position",
      new Float32BufferAttribute(
        polygon
          .map((coord) => [
            coord[0],
            coord[1],
            height - (coord[0] * normal[0] + coord[1] * normal[1]),
          ])
          .flat(),
        3,
      ),
    )
    const polyMesh = new Mesh(
      polyGeometry,
      new MeshBasicMaterial({ color: 0x808080, side: DoubleSide }),
    )
    scene.add(polyMesh)
    return polyMesh
  }, [])

  const [terrainMaterial] = useState(
    new ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        funMode: { value: false },
      },
      wireframe: true,
      // language=Glsl
      vertexShader: `
            varying float f;
            uniform float time;
            uniform bool funMode;
            void main() {
                f = position.z / 20.;
                vec3 pos = position;
                float l = length(position.xy / 250.);
                if (funMode) pos.z += l * sin(time * 0.001 + 15. * l) * 5.;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `,
      // language=Glsl
      fragmentShader: `
            varying float f;
            uniform float time;
            uniform bool funMode;
            void main() {
              gl_FragColor = vec4(0.5, 1.0, 0.5, 1.0);
                if (funMode) gl_FragColor = vec4(0.5 + 0.5*sin(time*0.001), 1.0 - f, 1.0, 1.0);
            }
        `,
    }),
  )

  async function getTerrainGeometry(imageUrl?: string) {
    if (imageUrl) {
      const data = await loadImageData(imageUrl)
      const geometry = new PlaneGeometry(500, 500, 499, 499)
      const posarray = geometry.getAttribute("position").array as Float32Array
      for (let i = 0; i < 500 * 500; i++) {
        const r = data[i * 4]
        const g = data[i * 4 + 1]
        const b = data[i * 4 + 2]
        posarray[i * 3 + 2] = (r + g + b) * 0.02
      }
      return geometry
    } else {
      const terrainPath = await Forma.geometry.getPathsByCategory({
        category: "terrain",
      })
      const terrainTriangles = await Forma.geometry.getTriangles({
        path: terrainPath[0],
      })
      const geometry = new BufferGeometry()
      geometry.setAttribute(
        "position",
        new BufferAttribute(terrainTriangles, 3),
      )
      return geometry
    }
  }

  async function initTerrain(imageUrl?: string) {
    const geometry = (await getTerrainGeometry(imageUrl)).toNonIndexed()
    const mesh = new Mesh(geometry, terrainMaterial)
    if (terrainMesh != null) {
      scene.remove(terrainMesh)
    }
    scene.add(mesh)
    setOriginalTerrainGeometry(geometry)
    setTerrainMesh(mesh)
  }

  useEffect(() => {
    const canvas = document.getElementById("canvas") as HTMLCanvasElement
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    void initTerrain()

    // Setup basic THREE js app for the canvas
    setRenderer(new WebGLRenderer({ canvas, antialias: true }))
    const newCamera = new PerspectiveCamera(
      75,
      canvas.width / canvas.height,
      0.01,
      1000,
    )
    newCamera.up.set(0, 0, 1)
    newCamera.position.set(-100, -200, 100)
    new OrbitControls(newCamera, canvas)
    setCamera(newCamera)

    const dl = new DirectionalLight(0xffffff, 1)
    dl.position.set(1, 0.7, 0.2)
    scene.add(dl)

    scene.add(new AmbientLight(0xffffff, 1))
  }, [])

  useEffect(() => {
    renderIteration++
    const currentRenderIteration = renderIteration

    let r = true
    window.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Space") {
        r = !r
      }
    })

    // Render the scene
    function loop(t: number) {
      if (camera != null && renderer != null && terrainMesh != null) {
        terrainMaterial.uniforms.funMode.value = funMode

        if (r) {
          terrainMaterial.uniforms.time.value = t
        }

        renderer.render(scene, camera)
        if (currentRenderIteration === renderIteration) {
          requestAnimationFrame(loop)
        }
      }
    }
    requestAnimationFrame(loop)
  }, [terrainMesh, funMode, camera, renderer])

  useEffect(() => {
    if (
      originalTerrainGeometry != null &&
      polygon != null &&
      terrainMesh != null
    ) {
      const newTerrainVertices = getNewTerrainVertices(
        originalTerrainGeometry,
        polygon,
        height,
        normal,
      )
      terrainMesh.geometry.setAttribute(
        "position",
        new BufferAttribute(newTerrainVertices, 3),
      )
      terrainMesh.geometry.attributes.position.needsUpdate = true

      polyMesh.geometry.setAttribute(
        "position",
        new Float32BufferAttribute(
          polygon
            .map((coord) => [
              coord[0],
              coord[1],
              height + 0.1 - (coord[0] * normal[0] + coord[1] * normal[1]),
            ])
            .flat(),
          3,
        ),
      )

      polyMesh.geometry.attributes.position.needsUpdate = true
    }
  }, [height, normal, originalTerrainGeometry])

  function goto(name?: string) {
    const imageUrl = name != null ? `${name}.png` : undefined
    void initTerrain(imageUrl)
  }

  async function save() {
    const refPoint = (await Forma.project.get()).refPoint
    const bbox = await Forma.terrain
      .getBbox()
      .then((bbox) => [
        [bbox.min.x, bbox.min.y] as [number, number],
        [bbox.max.x, bbox.max.y] as [number, number],
      ])
    const glb: ArrayBuffer = await new Promise((resolve, reject) => {
      if (terrainMesh != null) {
        const exportmesh = new Mesh(terrainMesh.geometry.clone())
        exportmesh.geometry.rotateX(-Math.PI / 2)
        repair(refPoint, bbox, exportmesh.geometry)
        new GLTFExporter().parse(
          exportmesh,
          (res) => {
            resolve(res as ArrayBuffer)
          },
          reject,
          { binary: true },
        )
      }
    })
    await Forma.proposal.replaceTerrain({ glb })
  }

  return (
    <>
      <button
        onClick={() => {
          goto("erna")
        }}
      >
        Erna
      </button>
      <button
        onClick={() => {
          goto("sindre")
        }}
      >
        Sindre
      </button>
      <button
        onClick={() => {
          goto("john")
        }}
      >
        John
      </button>
      <button
        onClick={() => {
          goto("andrew")
        }}
      >
        Andrew
      </button>
      <button
        onClick={() => {
          goto()
        }}
      >
        Current terrain
      </button>
      <button
        onClick={() => {
          void save()
        }}
      >
        Save
      </button>
      <input
        type="range"
        min="0"
        max="100"
        value={height}
        onInput={(e) => {
          setHeight(parseInt(e.currentTarget.value))
        }}
      />
      <input
        type="range"
        min="-1"
        max="1"
        step="0.1"
        value={normal[0]}
        onInput={(e) => {
          setNormal([parseFloat(e.currentTarget.value), normal[1], normal[2]])
        }}
      />
      <input
        type="range"
        min="-1"
        max="1"
        step="0.1"
        value={normal[1]}
        onInput={(e) => {
          setNormal([normal[0], parseFloat(e.currentTarget.value), normal[2]])
        }}
      />
      <button
        onClick={() => {
          setFunMode(!funMode)
        }}
      >
        {funMode ? "Please stop" : "I am bored"}{" "}
      </button>
    </>
  )
}

export default FloatingPanel
