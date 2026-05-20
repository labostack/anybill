/**
 * @module entities/Squad
 *
 * Squad entity — a group/family subscription unit.
 *
 * A squad is owned by a single subscriber (the owner who pays).
 * Members of the squad gain access to the subscription through the owner.
 * This enables family/group subscription plans.
 */

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn, OneToMany } from "typeorm";
import { Subscriber } from "./Subscriber";
import { SquadMember } from "./SquadMember";

@Entity()
export class Squad {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    /** Owner — the subscriber who pays for the group subscription. */
    @OneToOne(() => Subscriber)
    @JoinColumn()
    owner!: Subscriber;

    /** Foreign key to the owner subscriber. */
    @Column({ unique: true })
    ownerId!: string;

    /** Maximum number of members allowed (excluding the owner). 0 = unlimited. */
    @Column({ type: "integer" })
    maxMembers!: number;

    /** Members of this squad. */
    @OneToMany(() => SquadMember, (m) => m.squad)
    members!: SquadMember[];

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}
