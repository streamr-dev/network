const fs = require("fs")
const path = require("path")

module.exports = function(context, options) {

    const extractImportantLinks = (content) => {
        const importantClassesRegex = /^## Important Classes([\s\S]*?)^##/m
        const importantInterfacesRegex = /^## Important Interfaces([\s\S]*?)^##/m
    
        const importantClassesMatch = content.match(importantClassesRegex)
        const importantInterfacesMatch = content.match(importantInterfacesRegex)
    
        const importantClasses = importantClassesMatch
            ? importantClassesMatch[1].trim()
            : ""
        const importantInterfaces = importantInterfacesMatch
            ? importantInterfacesMatch[1].trim()
            : ""
    
        const linkRegex = /^\s*-\s*\[([^\]]+)\]\(([^\)]+)\)/gm
    
        const classes = []
        let match
        while ((match = linkRegex.exec(importantClasses))) {
            classes.push({ name: match[1], path: match[2] })
        }
    
        const interfaces = []
        while ((match = linkRegex.exec(importantInterfaces))) {
            interfaces.push({ name: match[1], path: match[2] })
        }
    
        return { classes, interfaces }
    }

    async function replaceModulesMd(fullPath) {
        const data = await fs.promises.readFile(fullPath, 'utf8')
        const results = data.replace(new RegExp("modules.md", 'g'), "index.md")
        try {
            await fs.promises.writeFile(fullPath, results, 'utf8')
        } catch (err) {
            console.error(err)
        }
    }
    
    async function readFolderRecursive(directory) {
        const folderStructure = {
            classes: [],
            interfaces: [],
            enums: [],
        }
    
        async function walk(folder) {
            const entries = await fs.promises.readdir(folder, {
                withFileTypes: true,
            })
    
            for (const entry of entries) {
                const fullPath = path.join(folder, entry.name)
    
                if (entry.isDirectory()) {
                    await walk(fullPath)
                } else if (entry.isFile()) {
                    const { dir, name } = path.parse(fullPath)
                    const category = path.basename(dir)
                    const extension = path.extname(fullPath)
    
                    if (extension === ".md") {
                        const relativePath = path.relative("docs/api", fullPath).replace(/\\/g, '/')
                        const fullPathW = fullPath.replace(/\\/g, '/')
                        //console.log('fullpwath', fullPathW)
                        switch (category) {
                            case "classes":
                                folderStructure[category].push({
                                    name,
                                    path: relativePath,
                                })
                                await replaceModulesMd(fullPath)
                                break
                            case "interfaces":
                                folderStructure[category].push({
                                    name,
                                    path: relativePath,
                                })
                                await replaceModulesMd(fullPath)
                                break
                            case "enums":
                                folderStructure[category].push({
                                    name,
                                    path: relativePath,
                                })
                                break
                            default:
                                break
                        }
                    }
                }
            }
        }
    
        await walk(directory)
        return folderStructure
    }
    
    const refineAPIRef = async () => {
        const sourceFilePath = "docs/api/modules.md"
        const destinationFilePath = "docs/api/modules.mdx"
    
        // replaces index content with module content
        // index is by default the readme, which we don't want
        if (fs.existsSync(sourceFilePath)) {
            const content = fs.readFileSync(sourceFilePath, "utf-8")
            fs.writeFileSync(destinationFilePath, content)
    
            fs.unlinkSync(sourceFilePath)
            fs.unlinkSync("docs/api/index.md")
        }
    
        const APILinks = await readFolderRecursive("docs/api")
    
        const content = fs.readFileSync(destinationFilePath, "utf-8")
        const featuredLinks = extractImportantLinks(content)
    
        // Remove unwanted sections
        let newContent = content.replace(/## Enumerations[\s\S]*?(?=##|$)/, "")
        newContent = newContent.replace(/## Other Interfaces[\s\S]*?(?=##|$)/, "")
        newContent = newContent.replace(/## Other Classes[\s\S]*?(?=##|$)/, "")
        newContent = newContent.replace(/## Important Classes[\s\S]*?(?=##|$)/, "")
        newContent = newContent.replace(
            /## Important Interfaces[\s\S]*?(?=##|$)/,
            ""
        )
        // Add the featured links and navigation
        newContent = newContent.replace(
            /sidebar_position: 0.5\ncustom_edit_url: null\n---/,
            `sidebar_position: 5\ncustom_edit_url: null\n---\n\nimport FeaturedLinks from 
            "@site/src/components/FeaturedLinks";\n\n## Featured Classes \n\n<FeaturedLinks links={${JSON.stringify(
                featuredLinks.classes
            )}} category="class" />\n\n## Featured Interfaces\n\n<FeaturedLinks links={${JSON.stringify(
                featuredLinks.interfaces
            )}} category="interface" />\n\n## Classes\n\n<FeaturedLinks links={${JSON.stringify(
                APILinks.classes
            )}} category="class" />\n\n## Interfaces\n\n<FeaturedLinks links={${JSON.stringify(
                APILinks.interfaces
            )}} category="interface" />\n\n## Enums\n\n<FeaturedLinks links={${JSON.stringify(
                APILinks.enums
            )}} category="enum" />`
        )

        newContent = newContent.replace(new RegExp("modules.md", 'g'), "index.md")
        newContent = newContent.replace(new RegExp("Ƭ", 'g'), "•")
        fs.writeFileSync("docs/api/index.md", newContent)
        fs.writeFileSync(sourceFilePath, newContent)
        fs.unlinkSync(destinationFilePath)
    }
    
    //refineAPIRef()
    return {
        name: 'refine-docs',
        async contentLoaded({content, actions}) {
            refineAPIRef()
        },
    }
}
