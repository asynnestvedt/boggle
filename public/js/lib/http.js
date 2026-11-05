export async function api(path, body) {
    let response
    try {
        response = await fetch(path, {
            method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
            headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
        })
    } catch {
        throw new Error('Cannot reach the server. Check your connection and try again.')
    }
    const result = await response.json()
    if (!response.ok) {
        const error = new Error(result.error || 'The request failed.')
        error.status = response.status
        throw error
    }
    return result
}
