/** Window event the analysis tables use to pin the network map. */
export const NETWORK_FILTER_EVENT = "campus-network-filter";

export interface NetworkMapFilter {
  label: string;
  ids: string[];
}
