import { render } from "preact"
import FloatingPanel from "./FloatingPanel"

function App() {
  return <FloatingPanel />
}

render(<App />, document.getElementById("ui")!)
