import React from 'react'
import ws from 'isomorphic-ws'
import { authExchange } from '@urql/exchange-auth'
import { createClient, dedupExchange, errorExchange, fetchExchange, subscriptionExchange, ssrExchange, Provider } from 'urql'
import { cacheExchange } from '@urql/exchange-graphcache'
import { SubscriptionClient } from 'subscriptions-transport-ws'
export function generateUrqlClient(auth, gqlEndpoint, publicRole) {
  const ssr = typeof window === 'undefined'
  const getAuth = () => {
    if (!auth.isAuthenticated()) {
      const token = auth.getJWTToken()
      const refreshToken = !ssr && localStorage.getItem('refresh_token')
      if (token && refreshToken) {
        return { token, refreshToken }
      }
      return null
    }
    // we could try a refresh token mutation/operation
    // if auth.refreshToken() would be a public function

    // const result = await auth.refreshToken(authState.refreshToken)
    // if (result) {
    //   return
    // }
    // else we logout
    // auth.logout()

    return null
  }
  const addAuthToOperation = ({ operation }) => {
    const fetchOptions =
      typeof operation.context.fetchOptions === 'function'
        ? operation.context.fetchOptions()
        : operation.context.fetchOptions || {}
    return {
      ...operation,
      context: {
        ...operation.context,
        fetchOptions: {
          ...fetchOptions,
          headers: !auth.isAuthenticated()
            ? {
                ...fetchOptions.headers,
                role: publicRole,
              }
            : {
                ...fetchOptions.headers,
                Authorization: `Bearer ${auth.getJWTToken()}`,
              },
        },
      },
    }
  }
  const didAuthError = ({ error }) => {
    return error.graphQLErrors.some((e) => e.extensions?.code === 'FORBIDDEN')
  }
  const uri = gqlEndpoint

  const wsUri = uri.startsWith('https') ? uri.replace(/^https/, 'wss') : uri.replace(/^http/, 'ws')

  const subscriptionClient = new SubscriptionClient(
    wsUri,
    {
      reconnect: true,
      connectionParams: {
        headers: !auth.isAuthenticated() ? { role: publicRole } : { Authorization: `Bearer ${auth.getJWTToken()}` },
      },
    },
    ws
  )

  const urqlClient = createClient({
    url: uri,
    requestPolicy: 'cache-and-network',
    exchanges: [
      dedupExchange,
      cacheExchange(),
      errorExchange({
        onError: (error) => {
          console.error(error.message.replace('[GraphQL]', 'Server error:'))
        },
      }),
      authExchange({
        getAuth,
        addAuthToOperation,
        didAuthError,
      }),
      fetchExchange,
      subscriptionExchange({
        forwardSubscription(operation) {
          return subscriptionClient.request(operation)
        },
      }),
    ],
  })

  return urqlClient
}

export function NhostUrqlProvider(props) {
  const { auth, gqlEndpoint, publicRole = 'public', children } = props
  const urqlClient = generateUrqlClient(auth, gqlEndpoint, publicRole)

  return <Provider value={urqlClient}>{children}</Provider>
}
