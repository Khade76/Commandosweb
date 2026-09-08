import { useEffect } from 'react'
import { DONATE_URL } from '../data/site.js'

export default function Donate() {
  useEffect(() => {
    window.location.replace(DONATE_URL)
  }, [])

  return null
}
