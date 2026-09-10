import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class AdminNoticesScreen extends StatefulWidget {
  final String institutionId;

  const AdminNoticesScreen({
    super.key,
    required this.institutionId,
  });

  @override
  State<AdminNoticesScreen> createState() => _AdminNoticesScreenState();
}

class _AdminNoticesScreenState extends State<AdminNoticesScreen> {
  final TextEditingController _titleController = TextEditingController();
  final TextEditingController _messageController = TextEditingController();

  String selectedTab = "all";
  String targetType = "all";

  String? selectedClass;
  String? selectedSection;

  List<String> selectedStudentIds = [];

  bool isSending = false;

  Future<void> sendNotice() async {
    final title = _titleController.text.trim();
    final message = _messageController.text.trim();

    if (title.isEmpty || message.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Enter title & message")),
      );
      return;
    }

    setState(() => isSending = true);

    try {
      Map<String, dynamic> data = {
        "institutionId": widget.institutionId,
        "title": title,
        "message": message,
        "targetType": targetType,
        "createdAt": Timestamp.now(),
        "createdBy": "admin",
      };

      if (targetType == "class") {
        if (selectedClass == null || selectedSection == null) {
          throw "Select class & section";
        }
        data["class"] = selectedClass;
        data["section"] = selectedSection;
      }

      if (targetType == "individual") {
        if (selectedStudentIds.isEmpty) {
          throw "Select students";
        }
        data["studentIds"] = selectedStudentIds;
      }

      final noticeRef = await FirebaseFirestore.instance
          .collection('notices')
          .add(data);
      if (targetType == "all") {
        await FirebaseFirestore.instance.collection('alerts').add({
          'institutionId': widget.institutionId,
          'title': title,
          'message': message,
          'source': "notices",
          'referenceId': noticeRef.id,
          'targetRoles': ["student", "teacher"],
          'createdAt': FieldValue.serverTimestamp(),
          'read': false,
        });
      }
      else if (targetType == "class") {
        await FirebaseFirestore.instance.collection('alerts').add({
          'institutionId': widget.institutionId,
          'title': title,
          'message': message,
          'source': "notices",
          'referenceId': noticeRef.id,
          'targetRoles': ["student"],
          'createdAt': FieldValue.serverTimestamp(),
          'read': false,
        });
      }
      else if (targetType == "individual") {
        for (var studentId in selectedStudentIds) {
          await FirebaseFirestore.instance.collection('alerts').add({
            'institutionId': widget.institutionId,
            'title': title,
            'message': message,
            'source': "notices",
            'referenceId': noticeRef.id,
            'targetRoles': ["student"],
            'targetUserId': studentId,
            'createdAt': FieldValue.serverTimestamp(),
            'read': false,
          });
        }
      }

      _titleController.clear();
      _messageController.clear();
      selectedStudentIds.clear();

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Notice sent")),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("$e")),
      );
    }

    setState(() => isSending = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      resizeToAvoidBottomInset: true,
      body: SafeArea(
        child: Column(
          children: [

            Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [

                  const Text(
                    "Notices",
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                    ),
                  ),

                  const SizedBox(height: 4),

                  Text(
                    "Send updates to students",
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey.shade600,
                    ),
                  ),
                  const SizedBox(height: 16),

                  Divider(
                    color: Color(0xFFEAEAEA),
                    thickness: 1,
                  ),

                  const SizedBox(height: 16),

                  SingleChildScrollView(

                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [

                        _buildTab(
                          title: "All",
                          value: "all",
                        ),

                        const SizedBox(width: 10),

                        _buildTab(
                          title: "Class",
                          value: "class",
                        ),

                        const SizedBox(width: 10),

                        _buildTab(
                          title: "Individual",
                          value: "individual",
                        ),

                        const SizedBox(width: 10),

                        _buildTab(
                          title: "Recent Notices",
                          value: "recent",
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 18),

                  Divider(
                    color: Color(0xFFEAEAEA),
                    thickness: 1,
                  ),

                  const SizedBox(height: 18),
                ],
              ),
            ),

            Expanded(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 250),
                child: _buildTabContent(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTab({
    required String title,
    required String value,
  }) {

    final isSelected = selectedTab == value;

    return GestureDetector(
      onTap: () {
        setState(() {
          selectedTab = value;
        });
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220),
        padding: const EdgeInsets.symmetric(
          horizontal: 18,
          vertical: 10,
        ),
        decoration: BoxDecoration(
          color: isSelected
              ? Colors.black
              : Colors.transparent,
          borderRadius: BorderRadius.circular(30),
          border: Border.all(
            color: isSelected
                ? Colors.black
                : Colors.grey.shade300,
          ),
        ),
        child: Text(
          title,
          style: TextStyle(
            color: isSelected
                ? Colors.white
                : Colors.black87,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }

  Widget _buildTabContent() {

    if (selectedTab == "recent") {
      return _buildRecentNotices();
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [

          if (selectedTab == "all")
            const SizedBox(height: 4),

          if (selectedTab != "all") ...[
            const Text(
              "Select Class",
              style: TextStyle(
                fontWeight: FontWeight.w600,
              ),
            ),

            const SizedBox(height: 8),

            _buildClassDropdown(),

            const SizedBox(height: 16),

            if (selectedClass != null) ...[
              const Text(
                "Select Section",
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                ),
              ),

              const SizedBox(height: 8),

              _buildSectionDropdown(),

              const SizedBox(height: 16),
            ],
          ],

          if (selectedTab == "individual" &&
              selectedClass != null &&
              selectedSection != null) ...[
            const Text(
              "Select Students",
              style: TextStyle(
                fontWeight: FontWeight.w600,
              ),
            ),

            const SizedBox(height: 8),

            _buildStudentMultiSelect(),

            const SizedBox(height: 18),
          ],

          const Text(
            "Title",
            style: TextStyle(
              fontWeight: FontWeight.w600,
            ),
          ),

          const SizedBox(height: 8),

          TextField(
            controller: _titleController,
            decoration: InputDecoration(
              hintText: "Enter title",
              filled: true,
              fillColor: Colors.grey.shade100,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide.none,
              ),
            ),
          ),

          const SizedBox(height: 18),

          const Text(
            "Message",
            style: TextStyle(
              fontWeight: FontWeight.w600,
            ),
          ),

          const SizedBox(height: 8),

          TextField(
            controller: _messageController,
            minLines: 8,
            maxLines: 10,
            decoration: InputDecoration(
              hintText: "Enter message",
              filled: true,
              fillColor: Colors.grey.shade100,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide.none,
              ),
            ),
          ),

          const SizedBox(height: 40),

          SizedBox(
            width: double.infinity,
            height: 54,
            child: ElevatedButton(
              onPressed: isSending
                  ? null
                  : () {

                targetType = selectedTab;

                sendNotice();
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.black,
                foregroundColor: Colors.white,
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: isSending
                  ? const SizedBox(
                height: 22,
                width: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
                  : const Text(
                "Send Notice",
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRecentNotices() {

    return StreamBuilder<QuerySnapshot>(
      stream: FirebaseFirestore.instance
          .collection('notices')
          .where(
        'institutionId',
        isEqualTo: widget.institutionId,
      )
          .orderBy(
        'createdAt',
        descending: true,
      )
          .snapshots(),
      builder: (context, snapshot) {

        if (!snapshot.hasData) {
          return const Center(
            child: CircularProgressIndicator(),
          );
        }

        final docs = snapshot.data!.docs;

        if (docs.isEmpty) {
          return const Center(
            child: Text("No notices yet"),
          );
        }

        return ListView.builder(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          itemCount: docs.length,
          itemBuilder: (context, index) {

            final data =
            docs[index].data() as Map<String, dynamic>;

            return Container(
              margin: const EdgeInsets.only(bottom: 14),
              padding: const EdgeInsets.symmetric(
                horizontal: 18,
                vertical: 20,
              ),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(
                  color: Colors.grey.shade200,
                ),
              ),
              child: Column(
                crossAxisAlignment:
                CrossAxisAlignment.start,
                children: [

                  Row(
                    children: [

                      Expanded(
                        child: Text(
                          data['title'] ?? "",
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),

                      PopupMenuButton<String>(
                        icon: const Icon(
                          Icons.more_horiz,
                          color: Colors.black87,
                        ),

                        onSelected: (value) async {

                          /// DELETE
                          if (value == "delete") {

                            await FirebaseFirestore.instance
                                .collection('notices')
                                .doc(docs[index].id)
                                .delete();

                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text("Notice deleted"),
                              ),
                            );
                          }

                          /// EDIT
                          if (value == "edit") {

                            _titleController.text =
                                data['title'] ?? "";

                            _messageController.text =
                                data['message'] ?? "";

                            setState(() {
                              selectedTab =
                                  data['targetType'] ?? "all";
                            });

                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text(
                                  "Edit mode loaded. Update and resend.",
                                ),
                              ),
                            );
                          }
                        },

                        itemBuilder: (context) => [

                          const PopupMenuItem(
                            value: "edit",
                            child: Text("Edit"),
                          ),

                          const PopupMenuItem(
                            value: "delete",
                            child: Text("Delete"),
                          ),
                        ],
                      ),
                    ],
                  ),

                  const SizedBox(height: 10),

                  Text(
                    data['message'] ?? "",
                    style: TextStyle(
                      color: Colors.grey.shade700,
                      height: 1.4,
                    ),
                  ),

                  const SizedBox(height: 14),

                  Text(
                    (data['targetType'] ?? "")
                        .toString()
                        .toUpperCase(),
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey.shade500,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildClassDropdown() {
    return FutureBuilder<QuerySnapshot>(
      future: FirebaseFirestore.instance
          .collection('classes')
          .where('institutionId', isEqualTo: widget.institutionId)
          .get(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) return const CircularProgressIndicator();

        return DropdownButtonFormField<String>(
          value: selectedClass,
          hint: const Text("Select Class"),

          decoration: InputDecoration(
            filled: true,
            fillColor: const Color(0xFFF8F8F8),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 16,
            ),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide.none,
            ),
          ),

          items: snapshot.data!.docs.map((doc) {
            final data = doc.data() as Map<String, dynamic>;
            final cls = data['class'].toString();

            return DropdownMenuItem(
              value: cls,
              child: Text("Class $cls"),
            );
          }).toList(),

          onChanged: (val) {
            setState(() {
              selectedClass = val;
              selectedSection = null;
              selectedStudentIds.clear();
            });
          },
        );
      },
    );
  }

  Widget _buildSectionDropdown() {
    return FutureBuilder<QuerySnapshot>(
      future: FirebaseFirestore.instance
          .collection('classes')
          .where('institutionId', isEqualTo: widget.institutionId)
          .get(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) return Container();

        final docs = snapshot.data!.docs;

        final selectedDoc = docs.firstWhere(
              (doc) =>
          (doc.data() as Map<String, dynamic>)['class'].toString() ==
              selectedClass,
        );

        final sections =
        (selectedDoc.data() as Map<String, dynamic>)['sections'] as List;

        return DropdownButtonFormField<String>(
          value: selectedSection,
          hint: const Text("Select Section"),

          decoration: InputDecoration(
            filled: true,
            fillColor: const Color(0xFFF8F8F8),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 16,
            ),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide.none,
            ),
          ),

          items: sections.map((sec) {
            return DropdownMenuItem(
              value: sec.toString(),
              child: Text("Section $sec"),
            );
          }).toList(),

          onChanged: (val) {
            setState(() {
              selectedSection = val;
              selectedStudentIds.clear();
            });
          },
        );
      },
    );
  }

  Widget _buildStudentMultiSelect() {
    return FutureBuilder<QuerySnapshot>(
      future: FirebaseFirestore.instance
          .collection('institutions')
          .doc(widget.institutionId)
          .collection('users')
          .where('class', isEqualTo: selectedClass)
          .where('section', isEqualTo: selectedSection)
          .get(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const CircularProgressIndicator();
        }

        return Container(
          height: 200,
          decoration: BoxDecoration(
            border: Border.all(color: Colors.grey),
            borderRadius: BorderRadius.circular(8),
          ),
          child: ListView(
            children: snapshot.data!.docs.map((doc) {
              final data = doc.data() as Map<String, dynamic>;
              final id = doc.id;
              final name = data['name'] ?? "Student";

              final isSelected = selectedStudentIds.contains(id);

              return CheckboxListTile(
                value: isSelected,
                title: Text(name),
                onChanged: (val) {
                  setState(() {
                    if (val == true) {
                      selectedStudentIds.add(id);
                    } else {
                      selectedStudentIds.remove(id);
                    }
                  });
                },
              );
            }).toList(),
          ),
        );
      },
    );
  }
}