import os
import yaml
from datetime import datetime, timezone, timedelta

WORKFLOWS_DIR = os.path.join(os.path.dirname(__file__), "..", ".github", "workflows")

def ultimo_domingo(ano, mes):
    if mes == 12:
        d = datetime(ano + 1, 1, 1, tzinfo=timezone.utc) - timedelta(days=1)
    else:
        d = datetime(ano, mes + 1, 1, tzinfo=timezone.utc) - timedelta(days=1)
    while d.weekday() != 6:
        d -= timedelta(days=1)
    return d

def detectar_modo():
    agora = datetime.now(timezone.utc)
    ano = agora.year
    inicio_verao = ultimo_domingo(ano, 3).replace(hour=1, minute=0)
    fim_verao = ultimo_domingo(ano, 10).replace(hour=1, minute=0)
    return inicio_verao <= agora < fim_verao

def ajustar_hora_cron(cron_str, usar_verao=True):
    partes = cron_str.split()
    if len(partes) < 2:
        return cron_str
    try:
        hora = int(partes[1])
    except ValueError:
        return cron_str
    nova_hora = (hora + 1) % 24 if usar_verao else (hora - 1) % 24
    partes[1] = str(nova_hora)
    return " ".join(partes)

def obter_horario_registado(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        for linha in f:
            if linha.strip().startswith("# horario:"):
                return linha.strip().split(":")[1].strip().lower()
    return None

def atualizar_comentario_horario(filepath, modo_atual):
    with open(filepath, "r", encoding="utf-8") as f:
        linhas = f.readlines()
    encontrou = False
    for i, linha in enumerate(linhas):
        if linha.strip().startswith("# horario:"):
            linhas[i] = f"# horario: {modo_atual}\n"
            encontrou = True
            break
    if not encontrou:
        linhas.insert(0, f"# horario: {modo_atual}\n")
    with open(filepath, "w", encoding="utf-8") as f:
        f.writelines(linhas)

def atualizar_crons_em_arquivo(filepath, usar_verao):
    horario_registado = obter_horario_registado(filepath)
    modo_atual = "verao" if usar_verao else "inverno"

    if horario_registado == modo_atual:
        print(f"{os.path.basename(filepath)} já está em {modo_atual}. Nenhuma alteração necessária.")
        return

    # 1. Ler YAML (pode converter 'on' -> True)
    with open(filepath, "r", encoding="utf-8") as f:
        try:
            data = yaml.safe_load(f)
        except yaml.YAMLError as e:
            print(f"Erro ao ler YAML em {filepath}: {e}")
            return

    # 2. Corrigir chave 'on' se tiver sido convertida para True
    if True in data:
        data["on"] = data.pop(True)

    on_section = data.get("on")
    if not on_section or "schedule" not in on_section:
        print(f"'{os.path.basename(filepath)}' não tem schedule. Ignorando.")
        return

    schedules = on_section["schedule"]

    # 3. Garantir que schedules é uma lista (caso raro de vir como dict único)
    if isinstance(schedules, dict):
        schedules = [schedules]
        on_section["schedule"] = schedules

    # 4. Ajustar horas nos cron
    for cron_dict in schedules:
        cron_antigo = cron_dict.get("cron")
        if cron_antigo:
            cron_novo = ajustar_hora_cron(cron_antigo, usar_verao)
            cron_dict["cron"] = cron_novo

    # 5. Escrever de volta, mantendo estilo simples
    with open(filepath, "w", encoding="utf-8") as f:
        yaml.dump(
            data,
            f,
            allow_unicode=True,
            default_flow_style=False,
            sort_keys=False
        )

    # 6. Atualizar o comentário # horario:
    atualizar_comentario_horario(filepath, modo_atual)
    print(f"{os.path.basename(filepath)} atualizado para {modo_atual}.")

def main():
    usar_verao = detectar_modo()
    print(f"Modo atual detectado: {'Verão' if usar_verao else 'Inverno'}")

    for filename in os.listdir(WORKFLOWS_DIR):
        if filename.endswith((".yml", ".yaml")):
            if filename == "atualiza_horario.yml":
                print(f"Ignorando {filename}")
                continue
            filepath = os.path.join(WORKFLOWS_DIR, filename)
            atualizar_crons_em_arquivo(filepath, usar_verao)

if __name__ == "__main__":
    main()
