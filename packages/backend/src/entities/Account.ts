/**
 * @module entities/Account
 *
 * Singleton account entity representing the platform administrator.
 *
 * The account holds authentication credentials and checkout page configuration.
 */

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class Account {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    /** Administrator email address (used for login). */
    @Column({ unique: true })
    email!: string;

    /** bcrypt hash of the admin password. */
    @Column()
    passwordHash!: string;

    /**
     * Checkout page customization settings (logo URL, brand name, colors, etc.).
     * Stored as a JSON blob — shape is defined by the admin UI.
     */
    @Column({ type: "simple-json", nullable: true })
    checkoutConfig!: Record<string, any> | null;

    /** URL to redirect the user to after a successful payment. */
    @Column({ type: "text", nullable: true })
    successRedirectUrl!: string | null;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}
