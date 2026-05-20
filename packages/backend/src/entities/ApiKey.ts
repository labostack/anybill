/**
 * @module entities/ApiKey
 *
 * API key entity for authenticating SDK and external API requests.
 *
 * Supports multiple named keys per account. The full key value is only
 * returned once upon creation and never again — the `prefix` field stores
 * a masked preview for display in the admin dashboard.
 */

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class ApiKey {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    /** Human-readable label (e.g. "Production", "Staging"). */
    @Column()
    name!: string;

    /** SHA-256 hash of the API key. The raw key is only returned at creation time. */
    @Column({ unique: true })
    key!: string;

    /** Masked preview of the key for display purposes (e.g. `"ak_3f8a1b2c..."`). */
    @Column()
    prefix!: string;

    /** Timestamp of the last authenticated request using this key. */
    @Column({ type: "datetime", nullable: true })
    lastUsedAt!: Date | null;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}
