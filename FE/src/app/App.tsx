import { LandingPage } from '../pages';
import { Doc } from '../widgets/Doc';
import { Routes, Route } from 'react-router-dom';
import { ReleaseNotesPage } from './../widgets/Doc/ui/ReleaseNotesPage';

function App() {

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/docs" element={<Doc />}/>
      <Route path="/note" element={<ReleaseNotesPage />}/>

    </Routes>

  )
}

export default App;