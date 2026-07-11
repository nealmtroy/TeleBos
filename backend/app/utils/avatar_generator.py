import hashlib

GRADIENTS = [
    # (start_color, end_color)
    ("#3B82F6", "#6366F1"),  # Indigo
    ("#8B5CF6", "#EC4899"),  # Purple/Pink
    ("#0D9488", "#10B981"),  # Teal/Emerald
    ("#F97316", "#EF4444"),  # Orange/Red
    ("#06B6D4", "#3B82F6"),  # Cyan/Blue
    ("#EC4899", "#8B5CF6"),  # Pink/Violet
    ("#10B981", "#3B82F6"),  # Emerald/Blue
]

def get_initials(first_name: str | None, last_name: str | None) -> str:
    """Extract up to two initials from first and last names."""
    parts = []
    if first_name:
        parts.append(first_name.strip())
    if last_name:
        parts.append(last_name.strip())
    
    if not parts:
        return ""
    
    initials = "".join(part[0] for part in parts if part)[:2]
    return initials.upper()

def generate_avatar_svg(seed: str, initials: str = "", is_group: bool = False) -> str:
    """Generate a premium SVG avatar with a custom gradient and icon/initials."""
    # Compute stable hash for seed to pick a gradient
    h = hashlib.md5(seed.encode("utf-8")).hexdigest()
    idx = int(h, 16) % len(GRADIENTS)
    start_color, end_color = GRADIENTS[idx]
    
    # We use a unique ID for the gradient to prevent conflicts in case of multiple inline SVGs
    grad_id = f"avatar-grad-{h[:8]}"
    
    svg_header = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
    <defs>
        <linearGradient id="{grad_id}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="{start_color}" />
            <stop offset="100%" stop-color="{end_color}" />
        </linearGradient>
    </defs>
    <rect width="100" height="100" fill="url(#{grad_id})" />"""

    svg_content = ""
    if initials:
        # Render clean text initials
        svg_content = f"""    <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="#FFFFFF" font-family="system-ui, -apple-system, sans-serif" font-size="38" font-weight="bold" letter-spacing="-1">
        {initials}
    </text>"""
    elif is_group:
        # Render a sleek group silhouette icon
        svg_content = """    <!-- Background Left User -->
    <circle cx="36" cy="40" r="10" fill="#FFFFFF" opacity="0.65" />
    <path d="M12 76 C12 63 22 55 36 55 C50 55 60 63 60 76 H12 Z" fill="#FFFFFF" opacity="0.65" />
    
    <!-- Background Right User -->
    <circle cx="64" cy="40" r="10" fill="#FFFFFF" opacity="0.65" />
    <path d="M40 76 C40 63 50 55 64 55 C78 55 88 63 88 76 H40 Z" fill="#FFFFFF" opacity="0.65" />
    
    <!-- Foreground Center User -->
    <circle cx="50" cy="35" r="13" fill="#FFFFFF" />
    <path d="M20 82 C20 67 32 57 50 57 C68 57 80 67 80 82 H20 Z" fill="#FFFFFF" />"""
    else:
        # Render a sleek single user silhouette icon
        svg_content = """    <circle cx="50" cy="35" r="14" fill="#FFFFFF" />
    <path d="M18 80 C18 65 32 55 50 55 C68 55 82 65 82 80 C82 81 81 82 80 82 H20 C19 82 18 81 18 80 Z" fill="#FFFFFF" />"""

    svg_footer = "</svg>"
    
    return f"{svg_header}\n{svg_content}\n{svg_footer}"
