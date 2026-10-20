import { createContext, useContext } from 'react'
import { businessUnitName, type MetricMeta, type QueryResult, type UserContext } from '../semantic/query'

/** Opens the metric card for a governed value, anchored to the element that was clicked. */
export type OpenMetricCard = (r: QueryResult<unknown>, anchor: HTMLElement) => void

export const MetricCardContext = createContext<OpenMetricCard | null>(null)
export const useMetricCard = () => useContext(MetricCardContext)

export const scopeLabel = (m: Pick<MetricMeta, 'scope'>, user: UserContext) =>
  m.scope === 'group' ? 'Group · shared by all BUs' : `${businessUnitName(user.businessUnit)} · BU`
