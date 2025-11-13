import { LandingPage } from '../pages';
import { Doc } from '../widgets/Doc';
import { Routes, Route } from 'react-router-dom';

function App() {

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/docs" element={<Doc />}/>

    </Routes>

  )
}

export default App;