"""Inspect public artifact metadata without weakening runtime integrity checks."""
import hashlib
import json
import urllib.request


def main():
    for url in ['https://pypi.org/pypi/tensorflow/2.16.1/json',
                'https://huggingface.co/api/models/thelou1s/yamnet/revision/156527d?blobs=true']:
        try:
            with urllib.request.urlopen(url, timeout=30) as response:
                data = json.load(response)
            if 'urls' in data:
                print('TensorFlow Windows CPython 3.12:',
                      [item['url'] for item in data['urls'] if 'cp312-cp312-win_amd64' in item['filename']])
            else:
                print('Model metadata:', [item for item in data.get('siblings', [])
                                          if item['rfilename'] == 'lite-model_yamnet_tflite_1.tflite'])
        except (OSError, ValueError) as exc:
            print(type(exc).__name__, str(exc))
    url = 'https://huggingface.co/thelou1s/yamnet/resolve/156527d/lite-model_yamnet_tflite_1.tflite'
    try:
        with urllib.request.urlopen(url, timeout=60) as response:
            data = response.read(25 * 1024 * 1024 + 1)
            print('Downloaded bytes:', len(data), 'content type:', response.headers.get('Content-Type'),
                  'sha256:', hashlib.sha256(data).hexdigest(), 'TFLite header:', data[4:8] == b'TFL3')
    except OSError as exc:
        print(type(exc).__name__, str(exc))


if __name__ == '__main__':
    main()
