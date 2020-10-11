interface useAuthProps {
  signedIn: boolean | null
}

export function NhostAuthProvider(auth: any): JSX.Element
export function NhostURqlProvider(
  auth: any,
  gqlEndpoint: string,
  headers?: {
    [key: string]: any
  },
  publicRole?: string
): JSX.Element

export function useAuth(): useAuthProps
