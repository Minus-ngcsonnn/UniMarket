/**
 * Centers page content and applies the standard responsive side gutters.
 * Use it inside the header, footer and pages so everything lines up on the same grid.
 * @param {'sm'|'md'|'lg'|'xl'} [width] maximum content width
 */
const WIDTHS = {
  sm: 'max-w-md', // narrow forms (login, register)
  md: 'max-w-3xl',
  lg: 'max-w-5xl',
  xl: 'max-w-[84rem]', // default: marketplace pages (1280px content + gutters, as in Figma)
}

export default function PageContainer({ as: Component = 'div', width = 'xl', className = '', children }) {
  return <Component className={`mx-auto w-full px-4 sm:px-6 lg:px-8 ${WIDTHS[width]} ${className}`}>{children}</Component>
}
