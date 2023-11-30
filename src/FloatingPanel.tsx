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
import { Forma } from "forma-embedded-view-sdk/auto"
import { useEffect } from "preact/hooks"

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

function goto(name: string) {
  window.location.href = `?image=${name}.png`
}

function FloatingPanel() {
  useEffect(() => {
    async function lol() {
      const url = new URLSearchParams(window.location.search).get("image")

      if (url) {
        // Usage example
        loadImageData(url).then((data) => {
          const plan = new PlaneGeometry(500, 500, 499, 499)
          const posarray = plan.getAttribute("position").array as Float32Array
          for (let i = 0; i < 500 * 500; i++) {
            const r = data[i * 4]
            const g = data[i * 4 + 1]
            const b = data[i * 4 + 2]
            posarray[i * 3 + 2] = (900 - (r + g + b)) * 0.02
          }
          scene.add(new Mesh(plan, material))
        }
      )} else {
        const terrainPath = await Forma.geometry.getPathsByCategory({
          category: "terrain",
        })
        const terrainTriangles = await Forma.geometry.getTriangles({
          path: terrainPath[0],
        })
        const geometry = new BufferGeometry()
          geometry.setAttribute("position", new BufferAttribute(terrainTriangles, 3))
          scene.add(new Mesh(geometry, material))
      }
      }
      lol()
      const canvas = document.getElementById("canvas") as HTMLCanvasElement
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight

      // Setup basic THREE js app for the canvas
      const renderer = new WebGLRenderer({ canvas, antialias: true })
      const scene = new Scene()
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
      scene.add(cube)

      const material = new ShaderMaterial({
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
        cube.rotation.set(t * 0.0001, t * 0.00001, t * 0.0002)
        if (r) {
          material.uniforms.time.value = t
        }
        renderer.render(scene, camera)
        requestAnimationFrame(loop)
      }
      requestAnimationFrame(loop)
    } )

  return (
    <>
      <button onClick={() => goto("erna")}>Erna</button>
      <button onClick={() => goto("sindre")}>Sindre</button>
      <button onClick={() => goto("john")}>John</button>
      <button onClick={() => goto("andrew")}>Andrew</button>
      <button onClick={() => window.location.href = "" }>Current terrain</button>
    </>
  )
}

export default FloatingPanel
