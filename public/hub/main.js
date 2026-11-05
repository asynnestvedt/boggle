// Room links and reset emails issued before the games hub lived at the root.
function followLegacyLink() {
  const url = new URL(location.href)
  if (url.searchParams.has('room') || url.searchParams.has('return') || new URLSearchParams(url.hash.slice(1)).has('reset')) {
    location.replace(`/woggle/${url.search}${url.hash}`)
  }
}
window.addEventListener('hashchange', followLegacyLink)
followLegacyLink()
