/**
 * Persistence model.
 *
 * <p>JPA {@code @Entity} classes mapped to tables in UniMarketDB. Tables are created
 * by {@code database/schema.sql}; Hibernate only validates the mapping. Entities must
 * not be returned from controllers - map them to DTOs in the service layer.</p>
 */
package com.unimarket.entity;
