class SourceUnavailable(Exception):
    """The evidence source could not be reached at all (connection, timeout, 5xx).

    Distinct from a single bad query: an unreachable source makes the run
    `partial`; a rejected query is recorded and the run carries on.
    """


class QueryRejected(Exception):
    """The source answered but refused the query (4xx)."""
