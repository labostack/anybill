/**
 * @module entities/SquadMember
 *
 * SquadMember entity — a user who has access through a squad.
 *
 * Members are identified by their external user ID (`uid`) from the
 * client's application. They are NOT AnyBill subscribers — their
 * access is derived from the squad owner's active subscription.
 */

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from "typeorm";
import { Squad } from "./Squad";

/**
 * Squad member lifecycle status.
 *
 * | Status    | Meaning                                  |
 * |-----------|------------------------------------------|
 * | `active`  | Currently a member of the squad.         |
 * | `removed` | Was removed from the squad by the owner. |
 */
export type SquadMemberStatus = "active" | "removed";

@Entity()
export class SquadMember {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    /** The squad this member belongs to. */
    @ManyToOne(() => Squad, (s) => s.members)
    squad!: Squad;

    /** Foreign key to the squad. */
    @Column()
    squadId!: string;

    /** External user identifier from the client's application. */
    @Column()
    uid!: string;

    /** Current membership status. */
    @Column({ type: "varchar", default: "active" })
    status!: SquadMemberStatus;

    /** When this member joined the squad. */
    @CreateDateColumn()
    joinedAt!: Date;

    /** When this member was removed (null if still active). */
    @Column({ type: "datetime", nullable: true })
    removedAt!: Date | null;
}
