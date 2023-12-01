import { point as turfPoint, polygon as turfPolygon } from "@turf/helpers"
import turfPlanepoint from "@turf/planepoint"
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
  Intersection,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Vector2,
  WebGLRenderer,
} from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter"
import { repair } from "./terrainRepair"

let renderIteration = 0

const drawnPolygon = JSON.parse(
  new URLSearchParams(window.location.search).get("polygon")!,
) as { x: number; y: number; z: number }[]

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
  getZ: (x: number, y: number) => number,
) {
  const newTerrain = terrain.clone()
  const posarray = newTerrain.toNonIndexed().getAttribute("position")
    .array as Float32Array
  for (let i = 0; i < posarray.length / 3; i++) {
    const x = posarray[i * 3]
    const y = posarray[i * 3 + 1]
    if (isInside([x, y], polygon)) {
      posarray[i * 3 + 2] = getZ(x, y)
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
  const [controls, setControls] = useState<OrbitControls>()
  const [camera, setCamera] = useState<Camera>()
  const [renderer, setRenderer] = useState<WebGLRenderer>()

  const [originalTerrainGeometry, setOriginalTerrainGeometry] =
    useState<BufferGeometry>()
  const [terrainMesh, setTerrainMesh] = useState<Mesh>()
  const [height, setHeight] = useState(0)
  const [normal, setNormal] = useState<[number, number, number]>([0, 0, 1])
  const [showBottomTooltip, setShowBottomTooltip] = useState(false)
  const [funMode, setFunMode] = useState(false)

  const [spheres] = useState(new Object3D())
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
              gl_FragColor = vec4(0.5, 1.0 - f, 1.0, 1.0);
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
    setCamera(newCamera)
    setControls(new OrbitControls(newCamera, canvas))

    const dl = new DirectionalLight(0xffffff, 1)
    dl.position.set(1, 0.7, 0.2)
    scene.add(dl)

    scene.add(new AmbientLight(0xffffff, 1))
    scene.add(spheres)
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

    const raycaster = new Raycaster()
    const pointer = new Vector2()
    let lastMouseEvent: MouseEvent | null = null
    let activePoint: Intersection | null = null

    function onMouseDown(event: MouseEvent) {
      if (camera == null) return

      pointer.x = (event.clientX / window.innerWidth) * 2 - 1
      pointer.y = -(event.clientY / window.innerHeight) * 2 + 1

      raycaster.setFromCamera(pointer, camera)
      const intersects = raycaster.intersectObject(spheres)
      activePoint = intersects[0]

      if (activePoint != null && controls != null) {
        controls.enabled = false
        setShowBottomTooltip(true)
      }
    }

    function onMouseUp() {
      activePoint = null

      if (controls) {
        controls.enabled = true
        setShowBottomTooltip(false)
      }
    }

    function onMouseMove(event: MouseEvent) {
      if (
        lastMouseEvent != null &&
        camera != null &&
        terrainMesh != null &&
        activePoint != null
      ) {
        if (event.ctrlKey || event.metaKey) {
          pointer.x = (event.clientX / window.innerWidth) * 2 - 1
          pointer.y = -(event.clientY / window.innerHeight) * 2 + 1
          raycaster.setFromCamera(pointer, camera)
          const intersects = raycaster.intersectObject(terrainMesh)

          if (intersects[0]) {
            activePoint.object.position.setX(intersects[0].point.x)
            activePoint.object.position.setY(intersects[0].point.y)
          }
        } else {
          const dy = event.clientY - lastMouseEvent.clientY
          activePoint.object.position.setZ(
            activePoint.object.position.z - dy * 0.4,
          )
        }

        const spheresPolygon = spheres.children.map((c) => [
          c.position.x,
          c.position.y,
          c.position.z,
        ])
        spheresPolygon.push(spheresPolygon[0])
        const triangle = turfPolygon([spheresPolygon])

        updateMeshes((x, y) => {
          const point = turfPoint([x, y])
          return turfPlanepoint(point, triangle)
        })
      }
      lastMouseEvent = event
    }

    spheres.remove(...spheres.children)
    drawnPolygon.slice(0, 3).forEach((point) => {
      const sphere = new Mesh(
        new SphereGeometry(3),
        new MeshBasicMaterial({
          side: DoubleSide,
        }),
      )
      sphere.position.set(point.x, point.y, point.z)
      spheres.add(sphere)
    })

    document.addEventListener("mousedown", onMouseDown, false)
    document.addEventListener("mouseup", onMouseUp, false)
    document.addEventListener("mousemove", onMouseMove, false)

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
    updateMeshes((x, y) => height - (x * normal[0] + y * normal[1]))
  }, [height, normal, originalTerrainGeometry])

  function goto(name?: string) {
    const imageUrl = name != null ? `${name}.png` : undefined
    void initTerrain(imageUrl)
  }

  function updateMeshes(getZ: (x: number, y: number) => number) {
    if (
      originalTerrainGeometry == null ||
      polygon == null ||
      terrainMesh == null
    )
      return

    const newTerrainVertices = getNewTerrainVertices(
      originalTerrainGeometry,
      polygon,
      getZ,
    )
    terrainMesh.geometry.setAttribute(
      "position",
      new BufferAttribute(newTerrainVertices, 3),
    )
    terrainMesh.geometry.attributes.position.needsUpdate = true

    polyMesh.geometry.setAttribute(
      "position",
      new Float32BufferAttribute(
        polygon.flatMap((coord) => [
          coord[0],
          coord[1],
          getZ(coord[0], coord[1]) + 0.1,
        ]),
        3,
      ),
    )
    polyMesh.geometry.attributes.position.needsUpdate = true
  }

  async function save() {
    const bbox = await Forma.terrain
      .getBbox()
      .then((bbox) => [
        [bbox.min.x, bbox.min.y] as [number, number],
        [bbox.max.x, bbox.max.y] as [number, number],
      ])
    const glb: ArrayBuffer = await new Promise((resolve, reject) => {
      if (terrainMesh != null) {
        const exportmesh = new Mesh(terrainMesh.geometry.clone())
        repair(bbox, exportmesh.geometry)
        exportmesh.geometry.rotateX(-Math.PI / 2)
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

      <div
        className="bottom-tooltip"
        style={{ display: showBottomTooltip ? "" : "none" }}
      >
        Hold ctrl/cmd to move the point
      </div>
    </>
  )
}

export default FloatingPanel
