import { Route, Routes } from 'react-router-dom'
import Header from './layout/Header.jsx'
import Footer from './layout/Footer.jsx'
import ScrollToTop from './layout/ScrollToTop.jsx'
import Home from './pages/Home.jsx'
import About from './pages/About.jsx'
import Companies from './pages/Companies.jsx'
import Company from './pages/Company.jsx'
import Servers from './pages/Servers.jsx'
import Stats from './pages/Stats.jsx'
import Enlist from './pages/Enlist.jsx'
import Rules from './pages/Rules.jsx'
import Donate from './pages/Donate.jsx'
import NotFound from './pages/NotFound.jsx'

export default function App() {
  return (
    <>
      <ScrollToTop />
      <div className="noise" aria-hidden="true" />
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/companies" element={<Companies />} />
          <Route path="/companies/:companyKey" element={<Company />} />
          <Route path="/servers" element={<Servers />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/enlist" element={<Enlist />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/wardogs" element={<Rules />} />
          <Route path="/donate" element={<Donate />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </>
  )
}
