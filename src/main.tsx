import { render } from "preact"
import FloatingPanel from "./Scene"

function App() {
  return <FloatingPanel />
}

render(<App />, document.getElementById("ui")!)
