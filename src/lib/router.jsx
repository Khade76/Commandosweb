import { Children, createContext, isValidElement, useContext, useEffect, useMemo, useState } from 'react'

const LocationContext = createContext(null)
const ParamsContext = createContext({})

function normalisePath(path = '/') {
  const clean = String(path || '/').split('?')[0].split('#')[0]
  if (!clean || clean === '/') return '/'
  return clean.startsWith('/') ? clean.replace(/\/$/, '') : `/${clean}`.replace(/\/$/, '')
}

function readLocation() {
  return {
    pathname: normalisePath(window.location.pathname),
    search: window.location.search,
    hash: window.location.hash,
  }
}

function isModifiedClick(event) {
  return event.metaKey || event.altKey || event.ctrlKey || event.shiftKey || event.button !== 0
}

function isExternalTarget(href) {
  return /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(href)
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matchRoute(routePath, pathname) {
  if (routePath === '*') return { matched: true, params: {} }

  const names = []
  const route = normalisePath(routePath)

  if (route === '/') {
    return { matched: pathname === '/', params: {} }
  }

  const pattern = route
    .split('/')
    .filter(Boolean)
    .map((part) => {
      if (part.startsWith(':')) {
        names.push(part.slice(1))
        return '([^/]+)'
      }
      return escapeRegex(part)
    })
    .join('/')

  const match = pathname.match(new RegExp(`^/${pattern}$`))
  if (!match) return { matched: false, params: {} }

  const params = names.reduce((result, name, index) => {
    result[name] = decodeURIComponent(match[index + 1] || '')
    return result
  }, {})

  return { matched: true, params }
}

export function BrowserRouter({ children }) {
  const [location, setLocation] = useState(readLocation)

  useEffect(() => {
    const onPopState = () => setLocation(readLocation())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const value = useMemo(() => ({
    location,
    navigate(to) {
      const href = typeof to === 'string' ? to : to?.pathname || '/'
      const url = new URL(href, window.location.origin)

      if (url.origin !== window.location.origin) {
        window.location.href = href
        return
      }

      const next = `${url.pathname}${url.search}${url.hash}`
      if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
        window.history.pushState({}, '', next)
        setLocation(readLocation())
      }
    },
  }), [location])

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>
}

export function useLocation() {
  const context = useContext(LocationContext)
  if (!context) return { pathname: '/', search: '', hash: '' }
  return context.location
}

export function useParams() {
  return useContext(ParamsContext)
}

export function Link({ to, href, onClick, target, children, ...props }) {
  const context = useContext(LocationContext)
  const linkHref = href || to || '/'

  function handleClick(event) {
    onClick?.(event)
    if (event.defaultPrevented || target || isModifiedClick(event) || isExternalTarget(linkHref)) return
    event.preventDefault()
    context?.navigate(linkHref)
  }

  return <a href={linkHref} target={target} onClick={handleClick} {...props}>{children}</a>
}

export function NavLink({ to, className, end = false, ...props }) {
  const location = useLocation()
  const target = normalisePath(to)
  const isActive = end ? location.pathname === target : location.pathname === target || location.pathname.startsWith(`${target}/`)
  const resolvedClass = typeof className === 'function' ? className({ isActive }) : [className, isActive ? 'active' : ''].filter(Boolean).join(' ')
  return <Link to={to} className={resolvedClass || undefined} {...props} />
}

export function Route() {
  return null
}

export function Routes({ children }) {
  const location = useLocation()
  const routeElements = Children.toArray(children).filter(isValidElement)

  for (const route of routeElements) {
    const result = matchRoute(route.props.path, location.pathname)
    if (result.matched) {
      return <ParamsContext.Provider value={result.params}>{route.props.element}</ParamsContext.Provider>
    }
  }

  return null
}
