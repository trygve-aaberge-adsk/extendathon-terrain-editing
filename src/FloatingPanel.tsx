import { Forma } from "forma-embedded-view-sdk/auto"
import { useEffect, useState } from "preact/hooks"
import {
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  DirectionalLight,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  TextureLoader,
  WebGLRenderer,
} from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter"

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

function goto(name?: string) {
  const urlQuery = new URLSearchParams(window.location.search)
  if (name != null) {
    urlQuery.set("image", `${name}.png`)
  } else {
    urlQuery.delete("image")
  }
  window.location.href = `?${urlQuery.toString()}`
}

function FloatingPanel() {
  const [scene] = useState(new Scene())
  const [originalTerrainGeometry, setOriginalTerrainGeometry] =
    useState<BufferGeometry>()
  const [terrainMesh, setTerrainMesh] = useState<Mesh>()
  const [polygon, setPolygon] = useState<[number, number][]>()

  const [height, setHeight] = useState(0)
  const [normal, setNormal] = useState<[number, number, number]>([0, 0, 1])
  const [funMode, setFunMode] = useState(false)

  const terrainMaterial = new ShaderMaterial({
    uniforms: {
      time: { value: 0 },
    },
    wireframe: true,
    // language=Glsl
    vertexShader: `
            varying float f;
            uniform float time;
            void main() {
                f = position.z / 20.;
                vec3 pos = position;
                float l = length(position.xy / 250.);
                pos.z += l * sin(time * 0.001 + 15. * l) * 5.;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `,
    // language=Glsl
    fragmentShader: `
            varying float f;
            uniform float time;
            void main() {
                gl_FragColor = vec4(0.5 + 0.5*sin(time*0.001), 1.0 - f, 1.0, 1.0);
            }
        `,
  })

  useEffect(() => {
    async function initTerrain() {
      const url = new URLSearchParams(window.location.search).get("image")

      if (url) {
        // Usage example
        void loadImageData(url).then((data) => {
          const plan = new PlaneGeometry(500, 500, 499, 499)
          const posarray = plan.getAttribute("position").array as Float32Array
          for (let i = 0; i < 500 * 500; i++) {
            const r = data[i * 4]
            const g = data[i * 4 + 1]
            const b = data[i * 4 + 2]
            posarray[i * 3 + 2] = (900 - (r + g + b)) * 0.02
          }
          const mesh = new Mesh(plan, terrainMaterial)
          scene.add(mesh)
          setOriginalTerrainGeometry(plan)
          setTerrainMesh(mesh)
        })
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
        const mesh = new Mesh(geometry, terrainMaterial)
        scene.add(mesh)
        setOriginalTerrainGeometry(geometry)
        setTerrainMesh(mesh)
      }
    }

    const canvas = document.getElementById("canvas") as HTMLCanvasElement
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const drawnPolygon = JSON.parse(
      new URLSearchParams(window.location.search).get("polygon")!,
    ) as { x: number; y: number; z: number }[]
    setPolygon(
      drawnPolygon.map((coord) => [coord.x, coord.y] as [number, number]),
    )

    void initTerrain()

    // Setup basic THREE js app for the canvas
    const renderer = new WebGLRenderer({ canvas, antialias: true })
    const camera = new PerspectiveCamera(
      75,
      canvas.width / canvas.height,
      0.01,
      1000,
    )
    camera.up.set(0, 0, 1)
    camera.position.set(-100, -200, 100)
    new OrbitControls(camera, canvas)

    // Setup the js app
    const geometry = new BoxGeometry(10, 10, 10)
    const m = new MeshLambertMaterial({
      color: 0xffffff,
      map: new TextureLoader().load("./sindre.png"),
    })
    const cube = new Mesh(geometry, m)
    //scene.add(cube)

    const dl = new DirectionalLight(0xffffff, 1)
    dl.position.set(1, 0.7, 0.2)
    scene.add(dl)

    scene.add(new AmbientLight(0xffffff, 1))

    let r = true
    window.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Space") {
        r = !r
      }
    })

    // Render the scene
    function loop(t: number) {
      if (terrainMesh != null) {
        terrainMaterial.uniforms.funMode.value = funMode
        cube.rotation.set(t * 0.0001, t * 0.00001, t * 0.0002)
        if (r) {
          terrainMaterial.uniforms.time.value = t
        }
      }

      renderer.render(scene, camera)
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  }, [])

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
    }
  }, [height, normal, originalTerrainGeometry])

  async function save() {
    const mesh = scene.children.find((c) => c.type === "Mesh") as Mesh
    const glb: ArrayBuffer = await new Promise((resolve, reject) => {
      const exportmesh = new Mesh(mesh.geometry.clone())
      exportmesh.geometry.rotateX(-Math.PI / 2)
      new GLTFExporter().parse(
        exportmesh,
        (res) => {
          resolve(res as ArrayBuffer)
        },
        reject,
        { binary: true },
      )
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
        min="0"
        max="1"
        step="0.1"
        value={normal[0]}
        onInput={(e) => {
          setNormal([parseFloat(e.currentTarget.value), normal[1], normal[2]])
        }}
      />
      <input
        type="range"
        min="0"
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
