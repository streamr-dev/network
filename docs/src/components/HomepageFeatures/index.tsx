import React from "react"
import clsx from "clsx"
import styles from "./styles.module.css"
import Link from "@docusaurus/Link"

type GatewayCard = {
    title: string
    icon: string
    buttonText: string
    link: string
    description: JSX.Element
}

const FeatureList: GatewayCard[] = [
    {
        title: "Quickstart",
        icon: "img/quickstart.png",
        description: (
            <>Practical guides for developers to get started with Streamr</>
        ),
        buttonText: "Discover quickstart",
        link: "quickstart/nodejs",
    },
    {
        title: "Usage",
        icon: "img/usage.png",
        description: (
            <>
                Get your head around the main concepts. Learn how to interact
                with the Network.
            </>
        ),
        buttonText: "Explore usage",
        link: "usage/authenticate",
    },
    {
        title: "Streamr Network",
        icon: "img/network.png",
        description: (
            <>
                Technical theory and advanced topics related to how the Streamr
                Network works.
            </>
        ),
        buttonText: "Explore Streamr Network",
        link: "streamr-network",
    },
    {
        title: "Node runners",
        icon: "img/noderunner.png",
        description: (
            <>
                Learn how to contribute your bandwidth and support the Network
                as a node runner.
            </>
        ),
        buttonText: "Run a node",
        link: "node-runners/run-a-node",
    },
]

function Feature({ title, icon, description, buttonText, link }: GatewayCard) {
    return (
        <div className={styles.card}>
            <div className={styles.icon}>
                <img src={icon} alt="" />
            </div>
            <div className={styles.text + "text--left"}>
                <h3 className={styles.header}>{title}</h3>
                <p className={styles.paragraph}>{description}</p>
                <Link style={{ textDecoration: "none" }} to={link}>
                    <button className="primary-button">{buttonText}</button>
                </Link>
            </div>
        </div>
    )
}

export default function HomepageFeatures(): JSX.Element {
    return (
        <section className={styles.cards + " container"}>
            <Feature {...FeatureList[0]} />
            <Feature {...FeatureList[1]} />
            <Feature {...FeatureList[2]} />
            <Feature {...FeatureList[3]} />
        </section>
    )
}
