package com.unimarket.service.order;

import java.sql.SQLException;

/**
 * Reads the SQL Server error number from a (wrapped) JDBC exception.
 *
 * <p>The V002 procedures signal business rule violations with {@code THROW 51xxx}; the order services
 * translate those numbers into API error codes so procedure texts are never shown to students.</p>
 */
public final class SqlErrors {

    /** Unique index / primary key violations. */
    public static final int DUPLICATE_KEY = 2627;
    public static final int DUPLICATE_INDEX_KEY = 2601;
    /** The transaction was chosen as a deadlock victim; it was rolled back and may be retried. */
    public static final int DEADLOCK_VICTIM = 1205;

    private SqlErrors() {
    }

    /** @return the first SQL Server error number in the cause chain, or -1 */
    public static int numberOf(Throwable ex) {
        for (Throwable cause = ex; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sql) {
                return sql.getErrorCode();
            }
        }
        return -1;
    }

    /** @return true for a unique key violation */
    public static boolean isDuplicateKey(Throwable ex) {
        int number = numberOf(ex);
        return number == DUPLICATE_KEY || number == DUPLICATE_INDEX_KEY;
    }
}
