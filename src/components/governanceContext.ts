import { createContext, useContext } from 'react'
import type { MetricId } from '../semantic/query'

/** Opens "Definitions & access" on one metric's definition (catalog tab, expanded, scrolled into view). */
export const GovernanceContext = createContext<(metricId: MetricId) => void>(() => {})
export const useOpenDefinition = () => useContext(GovernanceContext)
