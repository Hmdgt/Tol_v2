import os
import argparse
from typing import List, Tuple
# Importar módulos Tkinter para a interface gráfica de seleção de pasta
import tkinter as tk
from tkinter import filedialog

# --- Configurações ---
# Adicione ou remova extensões conforme a necessidade do seu projeto (React + Eletro/SQLite)
# ATUALIZADO: Ficheiros .py removidos para impedir o script de se incluir a si próprio
EXTENSIONS_TO_INCLUDE = ('.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.json', '.md')
DEFAULT_CHUNK_SIZE = 50000 # Limite de 50.000 caracteres por ficheiro de saída (ideal para partilha)
DEFAULT_OUTPUT_FOLDER_NAME = "code_chunks_output"


def get_all_code_files(root_dir: str) -> List[str]:
    """
    Percorre o diretório recursivamente e retorna uma lista de caminhos de ficheiro
    que correspondem às extensões definidas.
    """
    file_paths = []
    print(f"A analisar a pasta: {root_dir}")
    # Nota: os.walk é compatível com Windows, Linux e macOS.
    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Excluir pastas comuns de build/dependências para evitar ficheiros desnecessários
        dirnames[:] = [d for d in dirnames if d not in ('node_modules', '.git', 'dist', 'build', '__pycache__')]
        
        for filename in filenames:
            if filename.lower().endswith(EXTENSIONS_TO_INCLUDE):
                file_paths.append(os.path.join(dirpath, filename))
    
    print(f"Encontrados {len(file_paths)} ficheiros de código.")
    return file_paths

def create_file_chunks(files: List[str], root_dir: str, max_chunk_size: int) -> List[Tuple[str, str]]:
    """
    Combina o conteúdo dos ficheiros e divide-o em 'chunks' respeitando o limite.
    Retorna uma lista de tuplos: (nome_do_chunk, conteudo_do_chunk).
    """
    chunks = []
    current_chunk_content = ""
    chunk_count = 1

    for file_path in files:
        # Cria um cabeçalho para identificar o ficheiro original
        relative_path = os.path.relpath(file_path, root_dir)
        header = f"\n# --- START FILE: {relative_path} ---\n"
        footer = f"\n# --- END FILE: {relative_path} ---\n"
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            print(f"AVISO: Não foi possível ler o ficheiro {file_path}. Ignorado. Erro: {e}")
            continue

        file_block = header + content + footer
        
        # Verifica se o novo bloco excede o limite do chunk atual
        if len(current_chunk_content) + len(file_block) > max_chunk_size and current_chunk_content:
            # Guarda o chunk atual
            chunk_filename = f"output_chunk_{chunk_count}.txt"
            chunks.append((chunk_filename, current_chunk_content))
            print(f"Chunk {chunk_count} finalizado ({len(current_chunk_content)} caracteres).")
            
            # Começa um novo chunk
            current_chunk_content = file_block
            chunk_count += 1
        else:
            # Adiciona ao chunk atual
            current_chunk_content += file_block
    
    # Adiciona o último chunk (se houver conteúdo restante)
    if current_chunk_content:
        chunk_filename = f"output_chunk_{chunk_count}.txt"
        chunks.append((chunk_filename, current_chunk_content))
        print(f"Chunk {chunk_count} finalizado ({len(current_chunk_content)} caracteres).")
        
    return chunks

def write_chunks_to_disk(chunks: List[Tuple[str, str]], output_dir: str):
    """
    Escreve todos os chunks gerados no diretório de saída.
    """
    # Cria o diretório de saída se não existir
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"\nEscrevendo {len(chunks)} ficheiros de saída na pasta: {output_dir}")
    
    for filename, content in chunks:
        output_path = os.path.join(output_dir, filename)
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"   -> Criado: {filename}")
        
    print("\nProcesso concluído com sucesso!")
        
    # Informa o utilizador onde encontrar os ficheiros
    print(f"\nOs ficheiros de saída (output_chunk_*.txt) foram guardados aqui: {output_dir}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Agrega ficheiros de código de forma recursiva e divide o conteúdo em blocos (chunks) com limite de caracteres, mantendo o contexto do caminho original."
    )
    # Tornamos o argumento posicional opcional (nargs='?')
    parser.add_argument(
        "input_directory",
        type=str,
        nargs='?', 
        default=None,
        help="Opcional. O caminho da pasta principal do projeto. Se omitido, será pedida uma seleção gráfica."
    )
    parser.add_argument(
        "-s", "--size",
        type=int,
        default=DEFAULT_CHUNK_SIZE,
        help=f"O tamanho máximo de caracteres por ficheiro de saída. (Padrão: {DEFAULT_CHUNK_SIZE})"
    )
    parser.add_argument(
        "-o", "--output",
        type=str,
        default=DEFAULT_OUTPUT_FOLDER_NAME,
        help=f"O nome da pasta onde os ficheiros de saída serão guardados. Por padrão, é uma subpasta dentro do Input Directory ({DEFAULT_OUTPUT_FOLDER_NAME})."
    )

    args = parser.parse_args()
    root_dir = args.input_directory

    # 1. Lógica de Seleção Gráfica (Tkinter) se o argumento for omitido
    if not root_dir:
        # Inicializa Tkinter e esconde a janela principal
        root = tk.Tk()
        root.withdraw() 
        
        print("Aguardando seleção do diretório de entrada (Interface Gráfica)...")
        root_dir = filedialog.askdirectory(title="Selecione a Pasta Principal do Projeto (Input)")
        
        if not root_dir:
            print("Seleção cancelada pelo utilizador. A sair.")
            exit()
    
    # 2. Normaliza o caminho do diretório de entrada
    root_dir = os.path.abspath(root_dir)

    # 3. Define o diretório de saída
    if args.output == DEFAULT_OUTPUT_FOLDER_NAME:
        # Se for o nome padrão, cria-o como uma subpasta dentro da pasta de entrada
        output_dir = os.path.join(root_dir, DEFAULT_OUTPUT_FOLDER_NAME)
    else:
        # Se um nome/caminho diferente foi fornecido com -o, usa esse caminho
        output_dir = os.path.abspath(args.output)

    max_size = args.size

    if not os.path.isdir(root_dir):
        print(f"ERRO: O diretório de entrada '{root_dir}' não foi encontrado.")
    else:
        # 4. Encontrar ficheiros
        file_list = get_all_code_files(root_dir)
        
        if not file_list:
             print("Nenhum ficheiro elegível foi encontrado. Verifique as extensões configuradas.")
        else:
            # 5. Criar blocos (chunks)
            chunks = create_file_chunks(file_list, root_dir, max_size)
            
            # 6. Escrever no disco
            write_chunks_to_disk(chunks, output_dir)
