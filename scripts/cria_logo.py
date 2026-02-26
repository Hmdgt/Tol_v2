# -*- coding: utf-8 -*-
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import matplotlib.animation as animation
from matplotlib.path import Path
import numpy as np
from PIL import Image
import os

# ===============================
# TENTAR IMPORTAR svg.path
# ===============================
try:
    from svg.path import parse_path
    from svg.path.path import CubicBezier, Line
    SVGPATH_AVAILABLE = True
except ImportError:
    SVGPATH_AVAILABLE = False
    print("⚠️  svg.path não instalado. A forma orgânica será aproximada.")
    print("   Para a versão exata com o desenho do SVG, execute: pip install svg.path")

# ===============================
# CONFIGURAÇÕES PRINCIPAIS
# ===============================
fps = 20
circle_radius = 0.04

circle_positions = [
    (0.90, 0.45),
    (0.81, 0.53),
    (0.90, 0.61),
    (0.81, 0.69),
]

connections = [(0,1), (1,2), (2,3)]

texto_logo = "LOTO"

cores = {
    'original': {'fundo': 'black', 'logo': 'white'},
    'azul_branco': {'fundo': 'white', 'logo': '#007BFF'},
    'azul_transparente': {'fundo': 'transparent', 'logo': '#007BFF'},
    'laranja_branco': {'fundo': 'white', 'logo': '#FF6600'},
    'laranja_transparente': {'fundo': 'transparent', 'logo': '#FF6600'},
    'neon': {'fundo': 'black', 'logo': '#39FF14'}
}

# ===============================
# CÁLCULO DOS TEMPOS (ajustado)
# ===============================
speed_factor = 0.9
velocidade = (0.1204 / 0.4) * speed_factor
circle_draw_duration = (2 * np.pi * circle_radius) / velocidade
line_draw_duration = 0.4 * speed_factor

circle_start_times = [circle_draw_duration * i for i in range(4)]
last_circle_end = circle_start_times[-1] + circle_draw_duration

line_start_times = [last_circle_end + i * line_draw_duration for i in range(3)]
line_end_times = [start + line_draw_duration for start in line_start_times]
last_line_end = line_end_times[-1]

flicker_start = last_line_end + 0.2
flicker_duration = 0.6
flicker_cycles = 4
flicker_interval = flicker_duration / (flicker_cycles * 2)

circle3_disappear_time = flicker_start + flicker_duration

retract_start = circle3_disappear_time + 0.2
retract_duration = line_draw_duration * 0.8
retract_end = retract_start + retract_duration

# Preenchimento e texto começam após a retração
fill_and_text_start = retract_end  # pode adicionar um pequeno atraso se quiser

# Aparecimento da forma (começa depois do texto)
morph_appear_start = fill_and_text_start + 0.2
morph_appear_duration = 0.3
morph_shrink_start = morph_appear_start + morph_appear_duration
morph_shrink_duration = 0.5

# Escalas: começa 2.5, termina 1.5
scale_start = 2.5
scale_end = 1.5

# Texto começa no fill_and_text_start com tamanho normal (110)
text_start = fill_and_text_start

end_delay = 0.5
duration = morph_shrink_start + morph_shrink_duration + end_delay
frames = int(duration * fps)

# ===============================
# DADOS DO SVG
# ===============================
PATH1_D = "M314.382,347.586c0,0-11.004-1.761-21.79-0.881c-10.785,0.881-22.451,3.082-27.513-5.943c-5.063-9.024,2.862-19.369,10.345-19.589c7.483-0.22,11.885,0.661,15.627,3.082c0,0-1.98-9.465,4.843-10.565C302.716,312.589,321.866,317.211,314.382,347.586L314.382,347.586z"
PATH2_D = "M317.244,351.988c0,0-18.27-3.522-28.174-1.321c-9.904,2.202-19.369,10.565-13.426,23.992c5.943,13.426,19.149,14.085,24.212,11.665c5.063-2.421,9.905-7.264,13.646-16.067c0,0,1.541-1.76,2.2,0.44c0.661,2.201-1.32,7.483-1.32,10.785c0,3.302-0.88,10.564,9.024,12.766c9.905,2.202,17.828-7.703,20.03-16.947c2.201-9.245-0.661-18.269-10.566-21.791c0,0-3.301-1.541-2.2-2.202c1.102-0.66,8.145,0.22,10.125-6.382c1.98-6.604-6.824-15.188-10.565-17.168s-9.904,0-10.564,6.603C319.004,342.963,318.124,350.447,317.244,351.988L317.244,351.988z"
PATH3_D = "M292.812,326.236c0,0-13.207-6.383-19.809-0.44c-6.604,5.943-6.823,16.508,7.704,16.288c14.526-0.22,27.732-1.981,32.136,1.541c0,0,3.74-10.345-1.322-21.13c-5.062-10.785-25.091-10.565-17.167,4.402L292.812,326.236L292.812,326.236z"

COR_PATH1 = "#B83223"
COR_PATH2 = "#74C046"
COR_PATH3 = "#D43A2B"

# ===============================
# FUNÇÕES AUXILIARES SVG
# ===============================
def svg_path_to_mpath(d_string):
    if not SVGPATH_AVAILABLE:
        return None
    svg_path = parse_path(d_string)
    vertices = []
    codes = []
    for segment in svg_path:
        if isinstance(segment, CubicBezier):
            if not vertices:
                vertices.append((segment.start.real, segment.start.imag))
                codes.append(Path.MOVETO)
            vertices.append((segment.control1.real, segment.control1.imag))
            vertices.append((segment.control2.real, segment.control2.imag))
            vertices.append((segment.end.real, segment.end.imag))
            codes.append(Path.CURVE4)
            codes.append(Path.CURVE4)
            codes.append(Path.CURVE4)
        elif isinstance(segment, Line):
            if not vertices:
                vertices.append((segment.start.real, segment.start.imag))
                codes.append(Path.MOVETO)
            vertices.append((segment.end.real, segment.end.imag))
            codes.append(Path.LINETO)
    if len(vertices) > 1 and codes[-1] != Path.CLOSEPOLY:
        if np.allclose(vertices[0], vertices[-1]):
            vertices.append((0,0))
            codes.append(Path.CLOSEPOLY)
    return Path(vertices, codes)

def obter_bounding_box_svg():
    if not SVGPATH_AVAILABLE:
        return None
    all_verts = []
    for d in [PATH1_D, PATH2_D, PATH3_D]:
        svg_path = parse_path(d)
        for segment in svg_path:
            if hasattr(segment, 'start'):
                all_verts.append((segment.start.real, segment.start.imag))
            if hasattr(segment, 'end'):
                all_verts.append((segment.end.real, segment.end.imag))
            if hasattr(segment, 'control1'):
                all_verts.append((segment.control1.real, segment.control1.imag))
            if hasattr(segment, 'control2'):
                all_verts.append((segment.control2.real, segment.control2.imag))
    xs = [v[0] for v in all_verts]
    ys = [v[1] for v in all_verts]
    return min(xs), max(xs), min(ys), max(ys)

def criar_forma_logo(center, scale=1.0, alpha=1.0, inverter=False, deslocamento_y=0.0):
    """
    Retorna lista de patches da forma SVG.
    Se inverter=True, aplica reflexão vertical.
    deslocamento_y: valor a adicionar à coordenada y (para ajuste fino)
    """
    patches_list = []
    
    if SVGPATH_AVAILABLE:
        bbox = obter_bounding_box_svg()
        if bbox:
            xmin, xmax, ymin, ymax = bbox
            cx_svg = (xmin + xmax) / 2
            cy_svg = (ymin + ymax) / 2
            w_svg = xmax - xmin
            target_width = 0.18 * scale
            scale_factor = target_width / w_svg if w_svg != 0 else 1.0
            
            for d, cor in zip([PATH1_D, PATH2_D, PATH3_D], [COR_PATH1, COR_PATH2, COR_PATH3]):
                mpath = svg_path_to_mpath(d)
                if mpath is None:
                    continue
                new_vertices = []
                for v in mpath.vertices[:-1]:
                    if inverter:
                        y_novo = 2*cy_svg - v[1]
                        x_rel = (v[0] - cx_svg) * scale_factor
                        y_rel = (y_novo - cy_svg) * scale_factor
                    else:
                        x_rel = (v[0] - cx_svg) * scale_factor
                        y_rel = (v[1] - cy_svg) * scale_factor
                    new_vertices.append((center[0] + x_rel, center[1] + y_rel + deslocamento_y))
                if len(mpath.vertices) > 0 and mpath.codes[-1] == Path.CLOSEPOLY:
                    new_vertices.append((0,0))
                new_codes = mpath.codes[:]
                new_path = Path(new_vertices, new_codes)
                patch = patches.PathPatch(new_path,
                                          facecolor=cor,
                                          edgecolor='none',
                                          alpha=alpha,
                                          zorder=10)
                patches_list.append(patch)
    else:
        # Fallback aproximado
        base_scale = 0.20 * scale
        offset_y = 0.02 * scale + deslocamento_y
        verts_red = [
            (-0.30, 0.05), (-0.28, 0.35), (-0.05, 0.45),
            (0.10, 0.32), (0.18, 0.50), (0.40, 0.35),
            (0.35, 0.00), (0.18, 0.05), (-0.05, -0.02),
            (-0.28, 0.00), (-0.30, 0.05)
        ]
        if inverter:
            verts_red = [(x, -y) for (x, y) in verts_red]
        verts_red = [(center[0] + x*base_scale, center[1] + y*base_scale + offset_y) for x,y in verts_red]
        codes = [Path.MOVETO] + [Path.CURVE4]*9 + [Path.CLOSEPOLY]
        path_red = Path(verts_red, codes)
        patch_red = patches.PathPatch(path_red, facecolor="#E33621", edgecolor="none", alpha=alpha, zorder=10)
        patches_list.append(patch_red)
        
        theta = np.linspace(0, 2*np.pi, 400)
        r = 0.22 + 0.05*np.sin(3*theta)
        x = center[0] + base_scale*r*np.cos(theta)
        y = center[1] - 0.10*base_scale + base_scale*r*np.sin(theta) + offset_y
        if inverter:
            y = center[1] + 0.10*base_scale - base_scale*r*np.sin(theta) + offset_y
        verts_green = np.column_stack((x, y))
        codes_green = [Path.MOVETO] + [Path.LINETO]*(len(x)-2) + [Path.CLOSEPOLY]
        path_green = Path(verts_green, codes_green)
        patch_green = patches.PathPatch(path_green, facecolor="#63C314", edgecolor="none", alpha=alpha, zorder=10)
        patches_list.append(patch_green)
    
    return patches_list

# ===============================
# ANIMAÇÃO
# ===============================
fig, ax = plt.subplots(figsize=(8,8), dpi=150)
fig.patch.set_facecolor("black")
ax.set_facecolor("black")
ax.set_xlim(0,1)
ax.set_ylim(0,1)
ax.set_aspect("equal")
plt.axis("off")

circle_objs = [patches.Circle(pos, 0.0,
                              edgecolor="white",
                              facecolor="none",
                              lw=2,
                              zorder=5)
               for pos in circle_positions]
for c in circle_objs:
    ax.add_patch(c)

line_objs = [None] * len(connections)

text_obj = ax.text(0.76, 0.46, "", fontsize=110,
                   color="white", fontweight="bold",
                   ha="right", alpha=0, zorder=20)

filled = [False] * 3
forma_patches = []
forma_visivel = False
texto_mostrado = False  # para controlar se o texto já foi mostrado

def animate(i):
    global forma_patches, forma_visivel, texto_mostrado
    t = i / fps
    
    # 1. Círculos crescem
    for idx, circle in enumerate(circle_objs):
        start = circle_start_times[idx]
        if start <= t < start + circle_draw_duration:
            p = (t - start) / circle_draw_duration
            circle.set_radius(p * circle_radius)
        elif t >= start + circle_draw_duration:
            circle.set_radius(circle_radius)
    
    # 2. Linhas desenham-se (3 linhas)
    for j, (a, b) in enumerate(connections):
        start = line_start_times[j]
        if t < start:
            continue
        x0, y0 = circle_positions[a]
        x1, y1 = circle_positions[b]
        dx, dy = x1 - x0, y1 - y0
        dist = np.hypot(dx, dy)
        if dist > 0:
            ux, uy = dx / dist, dy / dist
            sx0, sy0 = x0 + ux * circle_radius, y0 + uy * circle_radius
            ex1, ey1 = x1 - ux * circle_radius, y1 - uy * circle_radius
        else:
            sx0, sy0 = x0, y0
            ex1, ey1 = x1, y1
        
        # Linha 3 (j=2) pode estar a retrair
        if j == 2 and t >= retract_start and t < retract_end:
            p_retract = 1 - (t - retract_start) / retract_duration
            new_x = sx0 + (ex1 - sx0) * p_retract
            new_y = sy0 + (ey1 - sy0) * p_retract
            if line_objs[j] is not None:
                line_objs[j].set_data([sx0, new_x], [sy0, new_y])
            elif p_retract > 0:
                line, = ax.plot([sx0, new_x], [sy0, new_y], color='white', lw=2, zorder=1)
                line_objs[j] = line
        elif j == 2 and t >= retract_end:
            # Linha já retraiu completamente: invisível
            if line_objs[j] is not None:
                line_objs[j].set_visible(False)
        elif t >= start and t < start + line_draw_duration:
            p = min((t - start) / line_draw_duration, 1)
            new_x = sx0 + (ex1 - sx0) * p
            new_y = sy0 + (ey1 - sy0) * p
            if line_objs[j] is None and p > 0:
                line, = ax.plot([sx0, new_x], [sy0, new_y], color='white', lw=2, zorder=1)
                line_objs[j] = line
            elif line_objs[j] is not None:
                line_objs[j].set_data([sx0, new_x], [sy0, new_y])
        elif t >= start + line_draw_duration and line_objs[j] is not None:
            if j != 2 or t < retract_start:
                line_objs[j].set_data([sx0, ex1], [sy0, ey1])
    
    # 3. Piscar do 4º círculo
    if t >= flicker_start and t < flicker_start + flicker_duration:
        cycle_pos = (t - flicker_start) % (2 * flicker_interval)
        visible = cycle_pos < flicker_interval
        circle_objs[3].set_visible(visible)
    elif t >= flicker_start + flicker_duration:
        circle_objs[3].set_visible(False)
    
    # 4. Preenchimento dos círculos e texto (após a retração)
    if t >= fill_and_text_start:
        # Preencher os 3 primeiros círculos
        for idx in range(3):
            if not filled[idx]:
                circle_objs[idx].set_facecolor("white")
                filled[idx] = True
        # Engrossar as duas primeiras linhas
        for j in [0, 1]:
            if line_objs[j] is not None:
                line_objs[j].set_linewidth(8)
        # Mostrar texto (se ainda não mostrou)
        if not texto_mostrado:
            text_obj.set_text(texto_logo)
            text_obj.set_alpha(1.0)
            texto_mostrado = True
    
    # 5. Aparecimento da forma SVG (começa depois)
    if t >= morph_appear_start:
        if t < morph_shrink_start:
            progress = (t - morph_appear_start) / morph_appear_duration
            current_alpha = min(progress, 1.0)
            current_scale = scale_start  # 2.5
        elif t < morph_shrink_start + morph_shrink_duration:
            progress = (t - morph_shrink_start) / morph_shrink_duration
            current_scale = scale_start + (scale_end - scale_start) * progress  # de 2.5 a 1.5
            current_alpha = 1.0
        else:
            current_scale = scale_end
            current_alpha = 1.0
        
        # Deslocamento para cima (evitar sobreposição)
        deslocamento = 0.02  # ajuste fino
        
        if not forma_visivel:
            forma_patches = criar_forma_logo(circle_positions[3], scale=current_scale, alpha=current_alpha, inverter=True, deslocamento_y=deslocamento)
            for p in forma_patches:
                ax.add_patch(p)
            forma_visivel = True
        else:
            # Atualizar removendo e recriando (simples)
            for p in forma_patches:
                p.remove()
            forma_patches = criar_forma_logo(circle_positions[3], scale=current_scale, alpha=current_alpha, inverter=True, deslocamento_y=deslocamento)
            for p in forma_patches:
                ax.add_patch(p)
    
    # Coletar artistas para blitting
    artists = circle_objs + [l for l in line_objs if l is not None and l.get_visible()] + [text_obj]
    if forma_visivel:
        artists.extend(forma_patches)
    return artists

print("🎞️ A gerar animação GIF...")
ani = animation.FuncAnimation(fig, animate,
                              frames=frames,
                              interval=1000/fps,
                              blit=True)

ani.save("loto_logo_animado.gif", writer="pillow", fps=fps)
print("✅ GIF guardado: loto_logo_animado.gif")
plt.close(fig)

# ===============================
# GERAR ÍCONES PARA TODAS AS CORES (192x192 e 512x512)
# ===============================
print("🖼️ A gerar ícones PNG para todas as variantes...")

os.makedirs("icons", exist_ok=True)

def gerar_imagem_base(nome_cor, cor_logo, fundo, tamanho_base=1024):
    """Gera uma imagem PIL do logo no tamanho base."""
    fig, ax = plt.subplots(figsize=(tamanho_base/100, tamanho_base/100), dpi=100)
    ax.set_xlim(0,1)
    ax.set_ylim(0,1)
    ax.set_aspect("equal")
    ax.set_facecolor(fundo if fundo != 'transparent' else 'none')
    fig.patch.set_facecolor(fundo if fundo != 'transparent' else 'none')
    plt.axis("off")
    
    # Linhas (0-1 e 1-2)
    for j, (a, b) in enumerate(connections[:2]):
        x0, y0 = circle_positions[a]
        x1, y1 = circle_positions[b]
        ax.plot([x0, x1], [y0, y1], color=cor_logo, lw=8, zorder=1)
    
    # Primeiros 3 círculos preenchidos
    for i in range(3):
        circ = patches.Circle(circle_positions[i], circle_radius,
                              edgecolor=cor_logo, facecolor=cor_logo, lw=2, zorder=5)
        ax.add_patch(circ)
    
    # Forma SVG invertida com deslocamento para cima (para não sobrepor)
    deslocamento = 0.02
    forma_patches = criar_forma_logo(circle_positions[3], scale=scale_end, alpha=1.0, inverter=True, deslocamento_y=deslocamento)
    for p in forma_patches:
        p.set_zorder(10)
        ax.add_patch(p)
    
    # Texto
    ax.text(0.76, 0.46, texto_logo, fontsize=110,
            color=cor_logo, fontweight='bold', ha='right', zorder=20)
    
    temp_filename = f"temp_{nome_cor}.png"
    plt.savefig(temp_filename, dpi=100, bbox_inches='tight',
                facecolor='none' if fundo == 'transparent' else fundo,
                transparent=(fundo == 'transparent'))
    plt.close(fig)
    
    with Image.open(temp_filename) as img:
        img.load()
        img_copy = img.copy()
    os.remove(temp_filename)
    return img_copy

for nome, cfg in cores.items():
    print(f"   A gerar variante: {nome}")
    img_base = gerar_imagem_base(nome, cfg['logo'], cfg['fundo'], tamanho_base=1024)
    
    img_192 = img_base.resize((192, 192), Image.Resampling.LANCZOS)
    img_192.save(f"icons/icon-192-{nome}.png")
    print(f"   ✅ icons/icon-192-{nome}.png")
    
    img_512 = img_base.resize((512, 512), Image.Resampling.LANCZOS)
    img_512.save(f"icons/icon-512-{nome}.png")
    print(f"   ✅ icons/icon-512-{nome}.png")

# Versão completa em alta resolução (opcional)
fig_full, ax_full = plt.subplots(figsize=(8,8), dpi=300)
ax_full.set_xlim(0,1)
ax_full.set_ylim(0,1)
ax_full.set_aspect("equal")
ax_full.set_facecolor("black")
fig_full.patch.set_facecolor("black")
plt.axis("off")

for j, (a, b) in enumerate(connections[:2]):
    x0, y0 = circle_positions[a]
    x1, y1 = circle_positions[b]
    ax_full.plot([x0, x1], [y0, y1], color='white', lw=8, zorder=1)

for i in range(3):
    circ = patches.Circle(circle_positions[i], circle_radius,
                          edgecolor='white', facecolor='white', lw=2, zorder=5)
    ax_full.add_patch(circ)

deslocamento = 0.02
forma_patches = criar_forma_logo(circle_positions[3], scale=scale_end, alpha=1.0, inverter=True, deslocamento_y=deslocamento)
for p in forma_patches:
    p.set_zorder(10)
    ax_full.add_patch(p)

ax_full.text(0.76, 0.46, texto_logo, fontsize=110,
             color='white', fontweight='bold', ha='right', zorder=20)

plt.savefig("loto_logo_final.png", dpi=300, bbox_inches='tight', facecolor='black')
plt.close(fig_full)
print("✅ loto_logo_final.png (versão completa)")

print("\n🎉 Todos os ficheiros criados com sucesso!")
print("📁 Ícones: icons/icon-192-*.png e icons/icon-512-*.png (6 variantes cada)")
print("📁 Animação: loto_logo_animado.gif")
if not SVGPATH_AVAILABLE:
    print("\n⚠️  Nota: A forma orgânica usada foi aproximada. Para o desenho exato, instale svg.path.")
