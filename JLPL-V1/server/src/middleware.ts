import { NextFunction, Request, Response } from 'express'

// Augment Express Request to carry parsed auth fields
declare global {
  namespace Express {
    interface Request {
      pat?: string
      team?: string
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization']
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header.' })
    return
  }
  req.pat = authHeader.slice(7).trim()
  req.team = (req.headers['x-team'] as string | undefined)?.toUpperCase() ?? 'DMO'
  next()
}
