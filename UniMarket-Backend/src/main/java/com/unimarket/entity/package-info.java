/**
 * Persistence model.
 *
 * <p>JPA {@code @Entity} classes mapped to tables in the UniMarketJava database. Tables are created
 * by {@code UniMarket_BusinessAligned.sql}; Hibernate only validates the mapping
 * ({@code ddl-auto=validate}). Table and column names are written exactly as in the SQL script.
 * Entities must not be returned from controllers - map them to DTOs in the service layer.</p>
 */
package com.unimarket.entity;
