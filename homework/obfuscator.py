import os
import random
import re


def generate_valid_js_identifier():
    """obfuscates vars (ex Scramjet to '__42331')."""
    return f"__{''.join(random.choices('0123456789', k=5))}"


def identical_aggressive_obfuscate(root_dir="."):
    # add .html here also fi some of your proxy workers and scripts are inlined into the html also
    allowed_extensions = {".js", ".mjs", ".cjs"}

    
    unified_token_registry = {
        "scramjet": generate_valid_js_identifier(),
        "baremux":  generate_valid_js_identifier(),
        "bare-mux": generate_valid_js_identifier(),
        "bare": generate_valid_js_identifier(),
        "mercuryworkshop": generate_valid_js_identifier(),
    }

    
    sorted_keywords = sorted(
        unified_token_registry.keys(), key=len, reverse=True
    )
    keyword_or_clause = "|".join(re.escape(k) for k in sorted_keywords)

    
    full_variable_pattern = re.compile(
        r"[a-zA-Z0-9_\$]*?(" + keyword_or_clause + r")[a-zA-Z0-9_\$]*?",
        re.IGNORECASE,
    )
 # change the path to wherever your proxy scripts and such are in
    target_folders = ["scram", "public", "baremux"]
    file_count = 0

    print(
        f" running in directory {os.path.abspath(root_dir)} "
    )

    for folder in target_folders:
        if not os.path.exists(folder):
            continue

        for dirpath, dirnames, filenames in os.walk(folder):
            if "node_modules" in dirnames:
                dirnames.remove("node_modules")
            if ".git" in dirnames:
                dirnames.remove(".git")

            for filename in filenames:
                _, ext = os.path.splitext(filename.lower())
                if ext in allowed_extensions:
                    file_path = os.path.join(dirpath, filename)

                    try:
                        with open(file_path, "r", encoding="utf-8") as f:
                            content = f.read()
                    except Exception:
                        continue

                    original_content = content

                    
                    content = re.sub(r"__\s+(\d+)", r"__\1", content)
                    content = re.sub(r"_\s+(\d+)", r"__\1", content)

                    
                    def replacer(match):
                        matched_text = match.group(0)

                        
                        if any(
                            char in matched_text
                            for char in [
                                "(",
                                ")",
                                "=",
                                ">",
                                "{",
                                "}",
                                "[",
                                "]",
                                ";",
                                ",",
                                ":",
                            ]
                        ):
                            return matched_text

                        matched_lower = matched_text.lower()

                        
                        norm_key = None
                        for k in sorted_keywords:
                            if k in matched_lower:
                                norm_key = k
                                break

                       
                        if not norm_key or norm_key not in unified_token_registry:
                            norm_key = "example"

                        
                        return unified_token_registry[norm_key]

                    content = full_variable_pattern.sub(replacer, content)

                    
                    if content != original_content:
                        file_count += 1
                        print(f"-> obfuscated: {file_path}")
                        with open(file_path, "w", encoding="utf-8") as f:
                            f.write(content)

    print(
        f"\n--- obfuscated {file_count} JavaScript files. ---"
    )
    print("\nrewritten:")
    for word, replacement in unified_token_registry.items():
        print(f"  '{word}' -> {replacement}")


if __name__ == "__main__":
    identical_aggressive_obfuscate(".")
