import { render } from "preact"
import FloatingPanel from "./FloatingPanel"
import LeftSide from "./LeftSide"

function App() {
  if (window.location.search.includes("page=left-side")) {
    return <LeftSide />
  }
  return <FloatingPanel />
}

render(<App />, document.getElementById("ui")!)
