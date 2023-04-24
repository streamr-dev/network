import React, { ReactNode } from "react"
import styles from "./styles.module.css"
import Link from "@docusaurus/Link"

interface FeatLinkProps {
    content: ReactNode
    label: string
    href: string
}

interface FeatLinksProps {
    links: FeatLink[]
    category: string
}

interface FeatLink {
    name: string
    path: string
}

const LinkType = {
    class: styles.classType,
    interface: styles.interfaceType,
    enum: styles.enumType,
}

export function FeaturedLink({
    content,
    label,
    href,
}: FeatLinkProps): JSX.Element {
    return (
        <Link style={{ textDecoration: "none" }} to={href.replace(".md", "")}>
            <div className={styles.link + " " + LinkType[label]}>
                <span>{content}</span>
            </div>
        </Link>
    )
}

export default function FeaturedLinks({
    links,
    category,
}: FeatLinksProps): JSX.Element {
    return (
        <section className={styles.linkList + " container"}>
            {links.map((link) => {
                return (
                    <FeaturedLink
                        key={link.path}
                        content={link.name}
                        href={link.path}
                        label={category}
                    />
                )
            })}
        </section>
    )
}
